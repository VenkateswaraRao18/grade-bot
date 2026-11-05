"""plaintext exam link passcode

Revision ID: c1a2f3b4d5e6
Revises: ebe96c5112ef
Create Date: 2026-11-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1a2f3b4d5e6'
down_revision: Union[str, None] = 'ebe96c5112ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No way to recover plaintext from the old hash, so existing links just
    # start out with passcode=NULL — the instructor regenerates to get a
    # visible one.
    op.add_column('exam_links', sa.Column('passcode', sa.String(), nullable=True))
    op.drop_column('exam_links', 'passcode_hash')


def downgrade() -> None:
    op.add_column('exam_links', sa.Column('passcode_hash', sa.String(), nullable=False, server_default=''))
    op.alter_column('exam_links', 'passcode_hash', server_default=None)
    op.drop_column('exam_links', 'passcode')
