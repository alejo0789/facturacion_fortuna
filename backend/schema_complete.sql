--
-- PostgreSQL database dump
--

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: contratos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos (
    id integer NOT NULL,
    proveedor_id integer,
    oficina_id integer,
    titular_nombre character varying(255),
    titular_cc_nit character varying(50),
    linea character varying(100),
    num_contrato character varying(100),
    fecha_inicio date,
    fecha_fin date,
    estado character varying(50),
    observaciones text,
    dude character varying(255),
    tipo character varying(100),
    ref_pago character varying(100),
    tipo_plan character varying(100),
    tipo_canal character varying(100),
    valor_mensual numeric(12,2),
    archivo_contrato character varying(500),
    tiene_iva character varying(10) DEFAULT 'no'::character varying,
    tiene_retefuente character varying(10) DEFAULT 'no'::character varying,
    retefuente_pct numeric(5,2)
);


--
-- Name: COLUMN contratos.archivo_contrato; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contratos.archivo_contrato IS 'Relative path to the contract PDF file';


--
-- Name: contratos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contratos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contratos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contratos_id_seq OWNED BY public.contratos.id;


--
-- Name: factura_oficinas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factura_oficinas (
    id integer NOT NULL,
    factura_id integer NOT NULL,
    oficina_id integer NOT NULL,
    contrato_id integer,
    valor numeric(12,2) NOT NULL,
    estado character varying(50),
    observaciones text
);


--
-- Name: factura_oficinas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factura_oficinas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factura_oficinas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factura_oficinas_id_seq OWNED BY public.factura_oficinas.id;


--
-- Name: factura_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factura_uploads (
    id integer NOT NULL,
    upload_id character varying(50) NOT NULL,
    filename character varying(255),
    original_filename character varying(255),
    file_path text,
    file_url text,
    status character varying(50),
    error_message text,
    factura_id integer,
    created_at timestamp without time zone,
    processed_at timestamp without time zone
);


--
-- Name: factura_uploads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factura_uploads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factura_uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factura_uploads_id_seq OWNED BY public.factura_uploads.id;


--
-- Name: facturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facturas (
    id integer NOT NULL,
    proveedor_id integer NOT NULL,
    oficina_id integer,
    contrato_id integer,
    numero_factura character varying(100),
    cufe character varying(255),
    fecha_factura date,
    fecha_vencimiento date,
    valor numeric(12,2),
    estado character varying(50),
    url_factura character varying(500),
    observaciones text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: facturas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.facturas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: facturas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.facturas_id_seq OWNED BY public.facturas.id;


--
-- Name: oficinas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oficinas (
    id integer NOT NULL,
    cod_oficina character varying(50),
    nombre character varying(255),
    tipo_sitio character varying(100),
    direccion character varying(255),
    ciudad character varying(100),
    zona character varying(100),
    dude character varying(50)
);


--
-- Name: oficinas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oficinas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oficinas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oficinas_id_seq OWNED BY public.oficinas.id;


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id integer NOT NULL,
    contrato_id integer,
    numero_factura character varying(50),
    fecha_pago date,
    valor numeric(12,2),
    periodo character varying(50),
    notes text
);


--
-- Name: pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_id_seq OWNED BY public.pagos.id;


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id integer NOT NULL,
    nit character varying(50) NOT NULL,
    nombre character varying(255) NOT NULL,
    iva character varying(50)
);


--
-- Name: proveedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedores_id_seq OWNED BY public.proveedores.id;


--
-- Name: contratos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos ALTER COLUMN id SET DEFAULT nextval('public.contratos_id_seq'::regclass);


--
-- Name: factura_oficinas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_oficinas ALTER COLUMN id SET DEFAULT nextval('public.factura_oficinas_id_seq'::regclass);


--
-- Name: factura_uploads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_uploads ALTER COLUMN id SET DEFAULT nextval('public.factura_uploads_id_seq'::regclass);


--
-- Name: facturas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas ALTER COLUMN id SET DEFAULT nextval('public.facturas_id_seq'::regclass);


--
-- Name: oficinas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficinas ALTER COLUMN id SET DEFAULT nextval('public.oficinas_id_seq'::regclass);


--
-- Name: pagos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos ALTER COLUMN id SET DEFAULT nextval('public.pagos_id_seq'::regclass);


--
-- Name: proveedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id SET DEFAULT nextval('public.proveedores_id_seq'::regclass);


--
-- Name: contratos contratos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_pkey PRIMARY KEY (id);


--
-- Name: factura_oficinas factura_oficinas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_oficinas
    ADD CONSTRAINT factura_oficinas_pkey PRIMARY KEY (id);


--
-- Name: factura_uploads factura_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_uploads
    ADD CONSTRAINT factura_uploads_pkey PRIMARY KEY (id);


--
-- Name: facturas facturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_pkey PRIMARY KEY (id);


--
-- Name: oficinas oficinas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficinas
    ADD CONSTRAINT oficinas_pkey PRIMARY KEY (id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- Name: proveedores proveedores_nit_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_nit_key UNIQUE (nit);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: idx_factura_oficinas_contrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factura_oficinas_contrato ON public.factura_oficinas USING btree (contrato_id);


--
-- Name: idx_factura_oficinas_factura; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factura_oficinas_factura ON public.factura_oficinas USING btree (factura_id);


--
-- Name: idx_factura_oficinas_oficina; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factura_oficinas_oficina ON public.factura_oficinas USING btree (oficina_id);


--
-- Name: idx_factura_uploads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factura_uploads_status ON public.factura_uploads USING btree (status);


--
-- Name: idx_factura_uploads_upload_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factura_uploads_upload_id ON public.factura_uploads USING btree (upload_id);


--
-- Name: idx_facturas_contrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facturas_contrato ON public.facturas USING btree (contrato_id);


--
-- Name: idx_facturas_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facturas_estado ON public.facturas USING btree (estado);


--
-- Name: idx_facturas_oficina; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facturas_oficina ON public.facturas USING btree (oficina_id);


--
-- Name: idx_facturas_proveedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facturas_proveedor ON public.facturas USING btree (proveedor_id);


--
-- Name: ix_contratos_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contratos_id ON public.contratos USING btree (id);


--
-- Name: ix_factura_oficinas_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_factura_oficinas_id ON public.factura_oficinas USING btree (id);


--
-- Name: ix_factura_uploads_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_factura_uploads_id ON public.factura_uploads USING btree (id);


--
-- Name: ix_factura_uploads_upload_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_factura_uploads_upload_id ON public.factura_uploads USING btree (upload_id);


--
-- Name: ix_facturas_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_facturas_id ON public.facturas USING btree (id);


--
-- Name: ix_oficinas_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_oficinas_id ON public.oficinas USING btree (id);


--
-- Name: ix_pagos_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pagos_id ON public.pagos USING btree (id);


--
-- Name: ix_proveedores_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_proveedores_id ON public.proveedores USING btree (id);


--
-- Name: contratos contratos_oficina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_oficina_id_fkey FOREIGN KEY (oficina_id) REFERENCES public.oficinas(id);


--
-- Name: contratos contratos_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id);


--
-- Name: factura_oficinas factura_oficinas_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_oficinas
    ADD CONSTRAINT factura_oficinas_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: factura_oficinas factura_oficinas_factura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_oficinas
    ADD CONSTRAINT factura_oficinas_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES public.facturas(id) ON DELETE CASCADE;


--
-- Name: factura_oficinas factura_oficinas_oficina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_oficinas
    ADD CONSTRAINT factura_oficinas_oficina_id_fkey FOREIGN KEY (oficina_id) REFERENCES public.oficinas(id);


--
-- Name: factura_uploads factura_uploads_factura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_uploads
    ADD CONSTRAINT factura_uploads_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES public.facturas(id);


--
-- Name: facturas facturas_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: facturas facturas_oficina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_oficina_id_fkey FOREIGN KEY (oficina_id) REFERENCES public.oficinas(id);


--
-- Name: facturas facturas_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id);


--
-- Name: pagos pagos_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- PostgreSQL database dump complete
