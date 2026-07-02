
-- Rooms
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  host_id UUID,
  status TEXT NOT NULL DEFAULT 'lobby', -- lobby | playing | finished
  current_step INT NOT NULL DEFAULT 0,  -- 0..(num_players-1)
  num_players INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Players
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  seat INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_room ON public.players(room_id);

-- Steps: each chain is owned by a player (chain_owner_id). step_index 0 = original sentence.
-- kind: 'sentence' | 'drawing' | 'guess'
CREATE TABLE public.steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  chain_owner_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  kind TEXT NOT NULL,
  text_content TEXT,
  drawing_data TEXT, -- data URL of PNG
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_owner_id, step_index)
);

CREATE INDEX idx_steps_room ON public.steps(room_id);
CREATE INDEX idx_steps_chain ON public.steps(chain_owner_id);

-- Open access (game is gated by passcode in app, no auth)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_all" ON public.rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "players_all" ON public.players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "steps_all" ON public.steps FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.steps REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.steps;
