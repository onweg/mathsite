"""Real app and repositories for Playwright; only the remote LLM is replaced.

Run only via: python -m uvicorn tests.e2e_app:app --host 127.0.0.1 --port 8001
No testing/reset endpoints are added to the production API.
"""
from contextlib import asynccontextmanager
from tests.support import configure_environment, database_dsn

import os
os.environ["TEST_SOLUTION_WORKER"] = "true"
configure_environment()
database_dsn()
from app.api.app_factory import create_app
from tests.fake_llm import FakeLLM

app = create_app()
production_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(app):
    async with production_lifespan(app):
        await app.state.pool.wait(timeout=15)
        app.state.llm = FakeLLM()
        app.state.solution_llm = app.state.llm
        yield


app.router.lifespan_context = lifespan
