"""Smoke test for the QuantumBlack AI gateway Azure OpenAI endpoint.

VPN is not required. Put credentials in `.env` next to this script.

    python -m pip install openai
    python qb_gateway.py

Override the model, prompt, or API version with flags if needed:

    python qb_gateway.py --model gpt-5.4-2026-03-05 --prompt "ping"
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from openai import AzureOpenAI

ENV_PATH = Path(__file__).with_name(".env")

INSTANCE_ID = "c14bbe16-d124-4f7f-a7fd-aba42ee3865e"
azure_endpoint = f"https://azure.prod.ai-gateway.quantumblack.com/{INSTANCE_ID}/"
azure_api_version = "2024-04-01-preview"
DEFAULT_MODEL = "gpt-5.4-2026-03-05"


def load_env(path: Path = ENV_PATH) -> None:
    """Load KEY=VALUE pairs from `.env` without overwriting existing env vars."""
    if not path.is_file():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def resolve_credential() -> str | None:
    """Prefer the long-lived clientID:clientSecret over a raw API key."""
    client_id = os.environ.get("QB_CLIENT_ID")
    client_secret = os.environ.get("QB_CLIENT_SECRET")
    if client_id and client_secret:
        return f"{client_id}:{client_secret}"
    return os.environ.get("AZURE_OPENAI_API_KEY") or os.environ.get("QB_GATEWAY_TOKEN")


def describe_credential(cred: str) -> None:
    if ":" in cred and cred.count(".") != 2:
        print(f"credential    : client credentials ({cred.split(':')[0]})")
        print("-" * 60)
        return
    print("credential    : api key / token")
    print("-" * 60)


def answer_text(res) -> str:
    choice = res.choices[0]
    message = choice.message
    content = message.content or ""
    if content:
        return content
    refusal = getattr(message, "refusal", None)
    if refusal:
        return f"[refusal] {refusal}"
    return "[empty content]"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--max-tokens", type=int, default=1000)
    parser.add_argument("--prompt", default="How many toes does a possum have?")
    parser.add_argument("--api-version", default=azure_api_version)
    args = parser.parse_args()

    load_env()
    cred = resolve_credential()
    if not cred:
        print(
            "Set QB_CLIENT_ID + QB_CLIENT_SECRET, or AZURE_OPENAI_API_KEY",
            file=sys.stderr,
        )
        return 2

    describe_credential(cred)
    print(f"endpoint     : {azure_endpoint}")
    print(f"api version  : {args.api_version}")
    print(f"model        : {args.model}")
    print("-" * 60)

    client = AzureOpenAI(
        azure_endpoint=azure_endpoint,
        api_key=cred,
        api_version=args.api_version,
    )
    started = time.time()
    res = client.chat.completions.create(
        model=args.model,
        messages=[{"role": "user", "content": args.prompt}],
        max_completion_tokens=args.max_tokens,
    )
    elapsed = time.time() - started

    print(answer_text(res))
    print("-" * 60)
    usage = res.usage
    print(f"id         : {res.id}")
    print(f"model      : {res.model}")
    print(f"finish     : {res.choices[0].finish_reason}")
    if usage:
        details = getattr(usage, "completion_tokens_details", None)
        reasoning = getattr(details, "reasoning_tokens", None) if details else None
        print(
            f"usage      : in={usage.prompt_tokens} out={usage.completion_tokens}"
            + (f" reasoning={reasoning}" if reasoning is not None else "")
        )
    print(f"elapsed    : {elapsed:.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
