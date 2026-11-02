"""Normalize final non-streaming provider responses without importing any SDK."""


FORMATS = ("openai-responses", "openai-chat", "anthropic", "gemini")


def number(data, key, default=None):
    value = data[key] if key in data else default
    if type(value) is not int or value < 0:
        raise ValueError(f"{key} must be a reported non-negative integer")
    return value


def mapping(value, label):
    if not isinstance(value, dict):
        raise ValueError(f"missing or invalid {label}")
    return value


def terminal_reason(value):
    return isinstance(value, str) and bool(value) and not value.endswith("_UNSPECIFIED")


def require_final(provider, response):
    final = False
    if provider == "openai-responses":
        final = response.get("object") == "response" and response.get("status") in {"completed", "incomplete", "failed", "cancelled"}
    elif provider == "openai-chat":
        choices = response.get("choices")
        final = response.get("object") == "chat.completion" and isinstance(choices, list) and bool(choices) and all(
            isinstance(choice, dict) and terminal_reason(choice.get("finish_reason")) for choice in choices)
    elif provider == "anthropic":
        final = response.get("type") == "message" and terminal_reason(response.get("stop_reason"))
    elif provider == "gemini":
        candidates = response.get("candidates")
        if isinstance(candidates, list) and candidates:
            final = all(isinstance(candidate, dict) and terminal_reason(candidate.get("finishReason")) for candidate in candidates)
        elif candidates is None or candidates == []:
            feedback = response.get("promptFeedback")
            final = isinstance(feedback, dict) and terminal_reason(feedback.get("blockReason"))
    if not final:
        raise ValueError("partial/streaming response or missing terminal metadata; export final usage")


def normalize_response(provider, response):
    require_final(provider, response)
    gemini = provider == "gemini"
    request_id = response.get("responseId" if gemini else "id")
    model = response.get("modelVersion" if gemini else "model")
    if not isinstance(request_id, str) or not request_id or not isinstance(model, str) or not model:
        raise ValueError("final responses require a stable response id and reported model version")
    raw = mapping(response.get("usageMetadata" if gemini else "usage"), "final response usage")
    writes = 0
    if provider == "openai-responses":
        inputs, outputs = number(raw, "input_tokens"), number(raw, "output_tokens")
        details = mapping(raw.get("input_tokens_details"), "input token details")
        cached = number(details, "cached_tokens")
        writes = number(details, "cache_write_tokens", 0)
        total = number(raw, "total_tokens")
    elif provider == "openai-chat":
        inputs, outputs = number(raw, "prompt_tokens"), number(raw, "completion_tokens")
        details = mapping(raw.get("prompt_tokens_details"), "prompt token details")
        cached = number(details, "cached_tokens")
        total = number(raw, "total_tokens")
    elif provider == "anthropic":
        cached = number(raw, "cache_read_input_tokens", 0)
        writes = number(raw, "cache_creation_input_tokens", 0)
        # Anthropic reports uncached input separately from cache reads/writes.
        inputs = number(raw, "input_tokens") + cached + writes
        outputs = number(raw, "output_tokens")
        total = inputs + outputs
    elif gemini:
        # Prompt includes cached content; tool prompts are another input component.
        inputs = number(raw, "promptTokenCount") + number(raw, "toolUsePromptTokenCount", 0)
        cached = number(raw, "cachedContentTokenCount", 0)
        outputs = number(raw, "candidatesTokenCount", 0) + number(raw, "thoughtsTokenCount", 0)
        total = number(raw, "totalTokenCount")
    else:
        raise ValueError("unsupported provider format")
    if total != inputs + outputs or cached > inputs:
        raise ValueError("inconsistent reported token totals")
    return request_id, model, {"input_tokens": inputs, "cached_input_tokens": cached,
                               "cache_write_input_tokens": writes, "output_tokens": outputs,
                               "total_tokens": total}
