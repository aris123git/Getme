-- Enable realtime for chat messages (run once in Supabase SQL editor)
-- Dashboard → Database → Publications → supabase_realtime
-- or run:

alter publication supabase_realtime add table messages;

-- Optional: needed for filtered realtime on UPDATE events
-- alter table messages replica identity full;
