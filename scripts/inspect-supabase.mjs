import pg from 'pg';

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error('SUPABASE_DB_URL is missing.');

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const result = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema in ('public', 'auth')
    order by table_schema, table_name
  `);
  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await client.end().catch(() => {});
}
