from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me-in-production"

    DATABASE_URL: str = "sqlite+aiosqlite:///./data/spending.db"

    AUTH_ENABLED: bool = False

    @property
    def db_path(self) -> Path:
        """Return the resolved path to the SQLite file."""
        url = self.DATABASE_URL
        # strip the driver prefix to get the file path
        path_str = url.split("///")[-1]
        return Path(path_str)


settings = Settings()
