-- Fix: post_connections UNIQUE constraint was (from_post_id, to_post_id) without
-- connection_type, which silently blocked all MT (green) connections between any
-- post pair that already had a BT (blue) connection. The entire upsert batch was
-- aborted by the FK violation, so green connections never reached the database.
-- Solution: include connection_type in the unique constraint so BT and MT can
-- coexist between the same two posts (common in multi-voltage electrical networks).

ALTER TABLE public.post_connections
  DROP CONSTRAINT IF EXISTS post_connections_from_post_id_to_post_id_key;

ALTER TABLE public.post_connections
  ADD CONSTRAINT post_connections_from_to_type_key
  UNIQUE (from_post_id, to_post_id, connection_type);
