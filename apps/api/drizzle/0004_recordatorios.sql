CREATE TYPE "public"."estado_recordatorio" AS ENUM('enviado', 'manual', 'fallido');--> statement-breakpoint
CREATE TYPE "public"."tipo_recordatorio" AS ENUM('24h', '2h');--> statement-breakpoint
CREATE TABLE "recordatorios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"cita_id" uuid NOT NULL,
	"tipo" "tipo_recordatorio" NOT NULL,
	"estado" "estado_recordatorio" NOT NULL,
	"detalle" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recordatorios_cita_tipo_uq" ON "recordatorios" USING btree ("cita_id","tipo");