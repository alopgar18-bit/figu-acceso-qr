DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'evento_privado' AND enumtypid = 'event_type'::regtype) THEN
    ALTER TYPE event_type ADD VALUE 'evento_privado';
  END IF;
END $$;