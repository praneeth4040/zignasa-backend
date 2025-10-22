// Ensure Supabase connection is established at server start
const supabase = require('../config/supabase');

// Optionally, test the connection by fetching the current timestamp from the database
async function testConnection() {
	try {
		// This will fail if the database is unreachable, but succeed if credentials are correct
		await supabase.from('pg_catalog.pg_tables').select('tablename').limit(1);
		console.log('✅ Supabase connection established.');
	} catch (error) {
		console.error('❌ Supabase connection failed:', error.message);
	}
}

module.exports = { supabase, testConnection };
