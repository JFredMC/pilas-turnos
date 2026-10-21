CREATE TABLE "excepciones_horario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"estilista_id" uuid,
	"fecha" date NOT NULL,
	"cerrado" boolean DEFAULT true NOT NULL,
	"abre_min" integer,
	"cierra_min" integer,
	"motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excepcion_horas" CHECK ("excepciones_horario"."cerrado" or ("excepciones_horario"."abre_min" is not null and "excepciones_horario"."cierra_min" is not null and "excepciones_horario"."abre_min" < "excepciones_horario"."cierra_min"))
);
--> statement-breakpoint
CREATE TABLE "recuperaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "salones" ADD COLUMN "abono_activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "salones" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "salones" ADD COLUMN "nequi_numero" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "debe_cambiar_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "password_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "excepciones_horario" ADD CONSTRAINT "excepciones_horario_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excepciones_horario" ADD CONSTRAINT "excepciones_horario_estilista_id_estilistas_id_fk" FOREIGN KEY ("estilista_id") REFERENCES "public"."estilistas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recuperaciones" ADD CONSTRAINT "recuperaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "excepciones_salon_fecha_idx" ON "excepciones_horario" USING btree ("salon_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "recuperaciones_token_uq" ON "recuperaciones" USING btree ("token_hash");