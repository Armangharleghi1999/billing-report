from fastapi import APIRouter, HTTPException

from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def register() -> dict:
    if not settings.AUTH_ENABLED:
        raise HTTPException(
            403, "Authentication is not enabled. Set AUTH_ENABLED=true in .env."
        )
    return {"message": "Registration endpoint — not yet implemented."}


@router.post("/login")
async def login() -> dict:
    if not settings.AUTH_ENABLED:
        raise HTTPException(
            403, "Authentication is not enabled. Set AUTH_ENABLED=true in .env."
        )
    return {"message": "Login endpoint — not yet implemented."}


@router.post("/logout")
async def logout() -> dict:
    if not settings.AUTH_ENABLED:
        raise HTTPException(
            403, "Authentication is not enabled. Set AUTH_ENABLED=true in .env."
        )
    return {"message": "Logout endpoint — not yet implemented."}
