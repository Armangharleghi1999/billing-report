"""Root entry point — run with: uvicorn main:app --reload --port 8000"""

import sys
from pathlib import Path

# Ensure backend package is importable
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from app.main import app  # noqa: E402, F401
