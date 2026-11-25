CREATE TABLE push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES push_tokens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL,
  ticket text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt timestamptz(6) NOT NULL DEFAULT now(),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX push_deliveries_due_idx ON push_deliveries(next_attempt);
CREATE INDEX push_deliveries_token_idx ON push_deliveries(token_id);

-- Queue only for devices registered at creation time. A rolled-back transaction
-- produces no delivery, and bulk notification inserts follow the same path.
CREATE FUNCTION queue_eventis_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO push_deliveries(token_id, user_id, title, body, data)
  SELECT id, user_id, NEW.title, left(NEW.body, 240),
         jsonb_build_object('notificationId', NEW.id, 'service', NEW.category, 'userId', NEW.user_id)
  FROM push_tokens WHERE user_id = NEW.user_id
    AND (NEW.type <> 'SAVED_EVENT_REMINDER' OR NOT EXISTS (
      SELECT 1 FROM user_notification_preferences
      WHERE user_id = NEW.user_id AND NOT event_updates
    ));
  RETURN NEW;
END $$;
CREATE TRIGGER notification_push AFTER INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION queue_eventis_notification();

CREATE FUNCTION queue_chat_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO push_deliveries(token_id, user_id, title, body, data)
  SELECT t.id, p.user_id, 'New message', 'Open Eventis to read your message.',
         jsonb_build_object('conversationId', c.id, 'service', c.service, 'userId', p.user_id)
  FROM conversation_participants p
  JOIN push_tokens t ON t.user_id = p.user_id
  JOIN conversations c ON c.id = p.conversation_id
  JOIN messages m ON m.id = NEW.message_id AND m.conversation_id = c.id
  WHERE p.id = NEW.participant_id AND NOT p.is_muted AND p.user_id <> m.sender_id;
  RETURN NEW;
END $$;
CREATE TRIGGER chat_push AFTER INSERT ON message_receipts
FOR EACH ROW EXECUTE FUNCTION queue_chat_push();

CREATE FUNCTION drop_previous_account_pushes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM push_deliveries WHERE token_id = OLD.id;
  RETURN NEW;
END $$;
CREATE TRIGGER push_token_reassigned BEFORE UPDATE OF user_id ON push_tokens
FOR EACH ROW WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id)
EXECUTE FUNCTION drop_previous_account_pushes();
