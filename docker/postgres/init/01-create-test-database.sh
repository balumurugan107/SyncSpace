#!/bin/sh
# Runs once, when the PostgreSQL data volume is first initialised.
# Creates a separate database for the automated test suite.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE DATABASE syncspace_test OWNER "$POSTGRES_USER";
SQL
