import pytest
from tests.support import configure_environment

configure_environment()


def pytest_collection_modifyitems(items):
    for item in items:
        if '/integration/' in str(item.path) or 'PostgresTests' in item.nodeid:
            item.add_marker(pytest.mark.integration)
