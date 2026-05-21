ALTER TYPE public.participant_status ADD VALUE IF NOT EXISTS 'aceptado_pendiente_envio';

CREATE OR REPLACE FUNCTION public.ensure_confirmation_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.confirmation_token IS NULL
     AND NEW.status IN ('aprobado','aceptado_pendiente_envio','invitacion_enviada','pendiente_confirmacion','confirmado','qr_generado','acceso_validado')
  THEN
    NEW.confirmation_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$function$;