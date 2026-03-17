import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking tables...');
  const tables = ['providers', 'purchases', 'purchase_items', 'purchase_payments', 'provider_debts', 'inventory_adjustments', 'owner_capital_injections'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    console.log(`Table ${table}:`, error ? `ERROR: ${error.message}` : 'EXISTS');
  }

  console.log('Checking buckets...');
  const { data: buckets, error: bError } = await supabase.storage.listBuckets();
  if (bError) {
    console.log('Failed to list buckets:', bError.message);
  } else {
    console.log('Buckets:', buckets.map(b => b.name));
  }
}

check();
