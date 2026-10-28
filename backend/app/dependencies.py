"""FastAPI dependency providers for Notice to Action backend."""

from extraction.llm_client import BaseLLMClient, get_llm_client


def get_llm() -> BaseLLMClient:
    """Provide LLM client instance for dependency injection.

    Overridable in tests via app.dependency_overrides[get_llm] = lambda: FakeLLMClient(...).
    """
    return get_llm_client()
