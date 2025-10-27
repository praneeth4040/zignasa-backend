const { createClient } = require('@supabase/supabase-js');

// Check for required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase environment variables');
    process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false
        }
    }
);

module.exports = supabase;

/*{
create table public.teams (
  id bigserial not null,
  team_name text not null,
  domain text not null,
  payment_status text not null default 'Pending'::text,
  created_at timestamp without time zone null default now(),
  razorpay_order_id text null,
  razorpay_payment_id text null,
  amount_in_paise integer null,
  team_size integer not null default 0,
  payment_initiated_at timestamp without time zone null,
  payment_verified_at timestamp without time zone null,
  constraint teams_pkey primary key (id),
  constraint teams_razorpay_order_id_unique unique (razorpay_order_id),
  constraint teams_domain_check check (
    (
      domain = any (
        array[
          'Web Dev'::text,
          'Agentic AI'::text,
          'UI/UX'::text
        ]
      )
    )
  ),
  constraint teams_payment_status_check check (
    (
      payment_status = any (
        array[
          'Pending'::text,
          'Initiated'::text,
          'Completed'::text,
          'Failed'::text,
          'Refunded'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;
 
create table public.registrations (
  id bigserial not null,
  team_id bigint null,
  name text not null,
  email text not null,
  phone text not null,
  college text not null,
  role text not null,
  created_at timestamp without time zone null default now(),
  constraint registrations_pkey primary key (id),
  constraint registrations_team_id_fkey foreign KEY (team_id) references teams (id) on delete CASCADE,
  constraint registrations_role_check check (
    (
      role = any (array['Team Lead'::text, 'Member'::text])
    )
  )
) TABLESPACE pg_default;
}*/