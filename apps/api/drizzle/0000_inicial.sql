CREATE TYPE "public"."estado_cita" AS ENUM('pendiente', 'confirmada', 'atendida', 'no_llego', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."estado_pago" AS ENUM('pendiente', 'confirmado', 'rechazado');--> statement-breakpoint
CREATE TYPE "public"."medio_pago" AS ENUM('efectivo', 'nequi');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('duena', 'estilista');--> statement-breakpoint
CREATE TYPE "public"."tipo_pago" AS ENUM('abono', 'saldo', 'propina');--> statement-breakpoint
CREATE TABLE "cierres_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"estilista_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"servicios" integer NOT NULL,
	"ventas" integer NOT NULL,
	"comision" integer NOT NULL,
	"propinas" integer NOT NULL,
	"efectivo" integer NOT NULL,
	"nequi" integer NOT NULL,
	"cerrado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"estilista_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"clienta_id" uuid,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"precio" integer NOT NULL,
	"estado" "estado_cita" DEFAULT 'pendiente' NOT NULL,
	"codigo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_despues" CHECK ("citas"."fin" > "citas"."inicio")
);
--> statement-breakpoint
CREATE TABLE "clientas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text NOT NULL,
	"consentimiento_en" timestamp with time zone NOT NULL,
	"consentimiento_version" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estilistas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"comision_pct" integer DEFAULT 50 NOT NULL,
	"activo" integer DEFAULT 1 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comision_rango" CHECK ("estilistas"."comision_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "horarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"estilista_id" uuid NOT NULL,
	"dia_semana" integer NOT NULL,
	"abre_min" integer NOT NULL,
	"cierra_min" integer NOT NULL,
	CONSTRAINT "dia_rango" CHECK ("horarios"."dia_semana" between 0 and 6),
	CONSTRAINT "rango_horas" CHECK ("horarios"."abre_min" < "horarios"."cierra_min")
);
--> statement-breakpoint
CREATE TABLE "lista_espera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"clienta_id" uuid NOT NULL,
	"servicio_id" uuid,
	"preferencia" text DEFAULT 'Cualquier hora' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"cita_id" uuid NOT NULL,
	"tipo" "tipo_pago" NOT NULL,
	"medio" "medio_pago" NOT NULL,
	"monto" integer NOT NULL,
	"estado" "estado_pago" DEFAULT 'pendiente' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monto_pos" CHECK ("pagos"."monto" >= 0)
);
--> statement-breakpoint
CREATE TABLE "salones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"ciudad" text DEFAULT 'Turbo' NOT NULL,
	"telefono" text,
	"abono_cop" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salones_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"minutos" integer NOT NULL,
	"precio" integer NOT NULL,
	"activo" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "minutos_pos" CHECK ("servicios"."minutos" > 0),
	CONSTRAINT "precio_pos" CHECK ("servicios"."precio" >= 0)
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"nombre" text NOT NULL,
	"rol" "rol" NOT NULL,
	"estilista_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_estilista_id_estilistas_id_fk" FOREIGN KEY ("estilista_id") REFERENCES "public"."estilistas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_estilista_id_estilistas_id_fk" FOREIGN KEY ("estilista_id") REFERENCES "public"."estilistas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_clienta_id_clientas_id_fk" FOREIGN KEY ("clienta_id") REFERENCES "public"."clientas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientas" ADD CONSTRAINT "clientas_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estilistas" ADD CONSTRAINT "estilistas_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_estilista_id_estilistas_id_fk" FOREIGN KEY ("estilista_id") REFERENCES "public"."estilistas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_clienta_id_clientas_id_fk" FOREIGN KEY ("clienta_id") REFERENCES "public"."clientas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_salon_id_salones_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_estilista_id_estilistas_id_fk" FOREIGN KEY ("estilista_id") REFERENCES "public"."estilistas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cierre_dia_uq" ON "cierres_caja" USING btree ("salon_id","estilista_id","fecha");--> statement-breakpoint
CREATE INDEX "citas_salon_inicio_idx" ON "citas" USING btree ("salon_id","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "citas_codigo_uq" ON "citas" USING btree ("salon_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "clientas_salon_tel_uq" ON "clientas" USING btree ("salon_id","telefono");--> statement-breakpoint
CREATE INDEX "estilistas_salon_idx" ON "estilistas" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "horarios_estilista_idx" ON "horarios" USING btree ("estilista_id");--> statement-breakpoint
CREATE INDEX "espera_salon_idx" ON "lista_espera" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "pagos_cita_idx" ON "pagos" USING btree ("cita_id");--> statement-breakpoint
CREATE INDEX "servicios_salon_idx" ON "servicios" USING btree ("salon_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uq" ON "usuarios" USING btree (lower("email"));