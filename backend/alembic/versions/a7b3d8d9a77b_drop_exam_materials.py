"""drop exam materials

Revision ID: a7b3d8d9a77b
Revises: e92b1fd573f3
Create Date: 2026-10-24 03:33:18.402734

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b3d8d9a77b'
down_revision: Union[str, None] = 'e92b1fd573f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Reference Material is gone from the product scope — questions are
    # grounded exclusively in the student's own bulk-tagged submission now.
    op.drop_index(op.f('ix_exam_materials_exam_id'), table_name='exam_materials')
    op.drop_table('exam_materials')


def downgrade() -> None:
    op.create_table(
        'exam_materials',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('exam_id', sa.UUID(), nullable=False),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=False),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('indexed', sa.Boolean(), nullable=False),
        sa.Column('ingested_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['exam_id'], ['exams.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_exam_materials_exam_id'), 'exam_materials', ['exam_id'], unique=False)
