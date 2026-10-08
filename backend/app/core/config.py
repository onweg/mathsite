from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    yc_folder_id: str
    yc_api_key: str
    yc_api_key_id: str = ""

    yc_model_chat: str = "yandexgpt/latest"
    yc_model_embed_doc: str = "text-search-doc/latest"
    yc_model_embed_query: str = "text-search-query/latest"

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "mathsite"
    postgres_user: str = "mathsite"
    postgres_password: str = "mathsite_dev_pw"

    pg_pool_min: int = 2
    pg_pool_max: int = 10

    app_env: str = "dev"
    app_port: int = 8000
    cors_origins: str = "http://localhost:5173"

    rate_limit_per_minute: int = 20
    rate_limit_per_hour: int = 200

    jwt_secret: str = "dev-secret-change-me"
    jwt_ttl_hours: int = 24 * 7
    jwt_algorithm: str = "HS256"

    upload_dir: str = "./uploads"

    @property
    def pg_dsn(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
