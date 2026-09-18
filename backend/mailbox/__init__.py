"""Composing, checking, delivering and recording a note to a student.

Nothing here is part of the graph and nothing here touches a mark: sending an
email is not an approval, so `provisional` is never read or written.
"""

from __future__ import annotations
