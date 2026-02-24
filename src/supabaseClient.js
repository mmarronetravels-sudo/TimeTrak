import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wrlsldeqytmrgpytoiac.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybHNsZGVxeXRtcmdweXRvaWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODYwMTcsImV4cCI6MjA4NzQ2MjAxN30.zSbvxoScimhDGMUVK7LCB_rs_8xU1a_kseeNRicOBfM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);