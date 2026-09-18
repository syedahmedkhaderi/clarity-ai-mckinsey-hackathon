"""Okapi BM25 in plain Python.

The corpus is a few hundred short passages built per request, so an inverted
index would be more machinery than the data warrants. Scoring walks the query
terms over per-document term counts.
"""

from __future__ import annotations

import math
import re
from collections import Counter

from backend import config

_WORD = re.compile(r"[a-z0-9]+")

# Small on purpose. Words such as "marks" or "test" carry meaning in this corpus,
# so only the glue words of a question are dropped.
STOP_WORDS = frozenset("""
a an and are as at be been but by can could did do does for from had has have how i if in
into is it its me my of on or our should so than that the their them then there these they
this to was we were what when where which who whom why will with would you your
""".split())

# Longest suffix first, so "weakness" loses "ness" before "s" is considered.
_SUFFIXES = (("ness", ""), ("ies", "y"), ("ing", ""), ("est", ""), ("ed", ""),
             ("es", ""), ("s", ""))
_MIN_STEM = 3


def _stem(token: str) -> str:
    """Light suffix stripping so "weakest", "weakness" and "weak" meet.

    It only has to be consistent between the passages and the question, not
    linguistically right. Tokens containing a digit are left alone.
    """
    if any(ch.isdigit() for ch in token):
        return token
    for suffix, replacement in _SUFFIXES:
        if not token.endswith(suffix) or len(token) - len(suffix) < _MIN_STEM:
            continue
        # "class" and "process" end in a real double s, not a plural.
        if suffix == "s" and token.endswith("ss"):
            continue
        return token[: -len(suffix)] + replacement
    return token


# "Test 3, Question 4" and "Test 4, Question 3" hold the same four tokens, so a
# bag of words cannot tell them apart. Joined, they are different terms.
_NUMBERED = ("test", "question")


def tokenize(text: str) -> list[str]:
    """Lower-cased word tokens, minus stop words and stray single letters.

    "test 3" and "question 4" become the single tokens "test3" and "question4".
    Any other lone digit is kept, since it can still be a mark or a value.
    """
    words = _WORD.findall(text.lower())
    tokens: list[str] = []
    i = 0
    while i < len(words):
        raw = words[i]
        following = words[i + 1] if i + 1 < len(words) else ""
        if raw in _NUMBERED and following.isdigit():
            tokens.append(f"{raw}{int(following)}")
            i += 2
            continue
        i += 1
        if raw in STOP_WORDS or (len(raw) == 1 and not raw.isdigit()):
            continue
        tokens.append(_stem(raw))
    return tokens


class BM25Index:
    """Scores documents against a query. Ties break on document position."""

    def __init__(self, documents: list[str], k1: float = config.BM25_K1,
                 b: float = config.BM25_B, weights: list[float] | None = None) -> None:
        self._k1 = k1
        self._b = b
        self._weights = weights or [1.0] * len(documents)
        self._counts = [Counter(tokenize(d)) for d in documents]
        self._lengths = [sum(c.values()) for c in self._counts]
        self._avg_length = (sum(self._lengths) / len(self._lengths)) if self._lengths else 0.0
        frequency: Counter[str] = Counter()
        for counts in self._counts:
            frequency.update(counts.keys())
        n = len(documents)
        # The "+ 1" inside the log keeps every weight positive. The textbook form
        # goes negative for a term found in over half the passages, and in this
        # corpus that is words like "marks" and "test".
        self._idf = {t: math.log(1 + (n - df + 0.5) / (df + 0.5)) for t, df in frequency.items()}

    def _score(self, index: int, terms: list[str]) -> float:
        counts, length = self._counts[index], self._lengths[index]
        norm = 1 - self._b + self._b * (length / self._avg_length if self._avg_length else 0.0)
        score = 0.0
        for term in terms:
            tf = counts.get(term, 0)
            if tf:
                score += self._idf[term] * tf * (self._k1 + 1) / (tf + self._k1 * norm)
        return score

    def search(self, query: str, k: int = config.CHAT_TOP_K) -> list[tuple[int, float]]:
        """Up to k (document index, score) pairs, best first, zero scores dropped."""
        terms = sorted(set(tokenize(query)))
        if not terms or k <= 0:
            return []
        scored = [(i, self._score(i, terms) * self._weights[i]) for i in range(len(self._counts))]
        ranked = sorted((s for s in scored if s[1] > 0), key=lambda s: (-s[1], s[0]))
        return ranked[:k]
