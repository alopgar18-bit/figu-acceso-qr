
ALTER TABLE public.public_forms
  ADD COLUMN IF NOT EXISTS header_image_url text,
  ADD COLUMN IF NOT EXISTS intro_text text,
  ADD COLUMN IF NOT EXISTS field_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.companions
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;
