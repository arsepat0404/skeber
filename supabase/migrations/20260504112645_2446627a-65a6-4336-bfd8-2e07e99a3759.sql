
-- Each player may submit at most ONE step per step_index per room
CREATE UNIQUE INDEX IF NOT EXISTS uniq_steps_author_per_step
  ON public.steps (room_id, step_index, author_id);

-- Speed up "how many submitted this step?" queries
CREATE INDEX IF NOT EXISTS idx_steps_room_step
  ON public.steps (room_id, step_index);
