import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import async_session, engine
from app.models import Base
from app.routers import (
    analytics,
    auth,
    budgets,
    ingest,
    merchant_notes,
    rules,
    transactions,
)
from app.services.categoriser import load_rules
from app.services.rule_migration import migrate_rules_from_json

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Ensure data directory exists
    db_path = settings.db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # Create tables if they don't exist (dev convenience; use Alembic in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Auto-migrate rules from JSON if DB table is empty
    async with async_session() as session:
        result = await migrate_rules_from_json(session)
        if result["status"] == "migrated":
            await session.commit()
            logger.info("Auto-migrated rules from JSON: %s", result)
        await load_rules(session)

    yield


app = FastAPI(
    title="Spending Visualiser",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(budgets.router)
app.include_router(ingest.router)
app.include_router(transactions.router)
app.include_router(rules.router)
app.include_router(analytics.router)
app.include_router(merchant_notes.router)
app.include_router(auth.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
