from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.categorization_rule import CategorizationRule
from app.models.category_name import CategoryName
from app.models.transaction import Transaction
from app.services.categoriser import reload_rules

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryCreate(BaseModel):
    name: str


class CategoryRename(BaseModel):
    new_name: str


@router.get("", response_model=list[str])
async def list_categories(
    session: AsyncSession = Depends(get_session),
) -> list[str]:
    result = await session.execute(
        select(CategoryName.name).order_by(CategoryName.name)
    )
    return [r[0] for r in result.all()]


@router.post("", response_model=str, status_code=201)
async def create_category(
    data: CategoryCreate,
    session: AsyncSession = Depends(get_session),
) -> str:
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Category name cannot be empty")
    existing = await session.get(CategoryName, name)
    if existing:
        raise HTTPException(status_code=409, detail="Category already exists")
    session.add(CategoryName(name=name))
    await session.commit()
    return name


@router.patch("/{name}", response_model=str)
async def rename_category(
    name: str,
    data: CategoryRename,
    session: AsyncSession = Depends(get_session),
) -> str:
    new_name = data.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="New name cannot be empty")
    existing = await session.get(CategoryName, name)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    if new_name != name:
        conflict = await session.get(CategoryName, new_name)
        if conflict:
            raise HTTPException(status_code=409, detail="Category name already exists")
        await session.delete(existing)
        session.add(CategoryName(name=new_name))
        await session.execute(
            update(CategorizationRule)
            .where(CategorizationRule.category == name)
            .values(category=new_name)
        )
        await session.execute(
            update(Transaction)
            .where(Transaction.category == name)
            .values(category=new_name)
        )
        await session.commit()
        await reload_rules(session)
    return new_name


@router.delete("/{name}")
async def delete_category(
    name: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    existing = await session.get(CategoryName, name)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    await session.execute(
        update(CategorizationRule)
        .where(CategorizationRule.category == name)
        .values(category="Other")
    )
    await session.execute(
        update(Transaction).where(Transaction.category == name).values(category="Other")
    )
    await session.delete(existing)
    await session.commit()
    await reload_rules(session)
    return {"deleted": True}
