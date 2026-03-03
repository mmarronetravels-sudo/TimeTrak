import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fgbigyffgzqzvksrkqxv.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnYmlneWZmZ3pxenZrc3JrcXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NTY5OTYsImV4cCI6MjA4NTUzMjk5Nn0.GCdHMlWABSNtHdTHMicIXzD3AqPMiBMlQN57GRDMqEc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
