-- Garantía en la base de datos: una estilista no puede tener dos citas activas que se crucen,
-- aunque lleguen dos reservas al mismo tiempo.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_sin_choques"
  EXCLUDE USING gist ("estilista_id" WITH =, tstzrange("inicio", "fin") WITH &&)
  WHERE ("estado" IN ('pendiente', 'confirmada', 'atendida'));
