-- =====================================================================
-- CORRECCION: crear_mi_usuario usaba 'limberhuaychoquispe@gmail.com'
-- (sin 81) mientras correo_admin() usa 'limberhuaychoquispe81@gmail.com'.
-- Ahora crear_mi_usuario usa public.correo_admin() (un solo lugar).
-- Ejecutar en el SQL Editor de Supabase. Se puede repetir.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.correo_admin()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT 'limberhuaychoquispe81@gmail.com'::text;
$$;

CREATE OR REPLACE FUNCTION public.crear_mi_usuario(
    p_nombre VARCHAR(100),
    p_numero VARCHAR(20),
    p_apellido VARCHAR(100) DEFAULT NULL,
    p_fecha_nacimiento DATE DEFAULT NULL,
    p_genero VARCHAR(20) DEFAULT NULL,
    p_ubicacion VARCHAR(255) DEFAULT NULL,
    p_foto_perfil VARCHAR(255) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_auth UUID := auth.uid();
    v_correo TEXT;
    v_confirmado TIMESTAMPTZ;
    v_proveedor TEXT;
    v_proveedores JSONB;
    v_nombre_rol TEXT := 'usuario';
    v_id_rol INT;
    v_id_usuario INT;
    v_es_admin BOOLEAN := FALSE;
BEGIN
    IF v_auth IS NULL THEN
        RETURN jsonb_build_object('resultado', 'no_autenticado');
    END IF;

    IF COALESCE(btrim(p_nombre), '') = ''
       OR COALESCE(btrim(p_numero), '') = ''
       OR btrim(p_numero) !~ '^\+?[0-9]{7,15}$' THEN
        RETURN jsonb_build_object('resultado', 'datos_invalidos');
    END IF;

    IF EXISTS (SELECT 1 FROM public.usuarios WHERE auth_usuario = v_auth) THEN
        RETURN jsonb_build_object('resultado', 'ya_existe');
    END IF;

    SELECT lower(email), email_confirmed_at,
           raw_app_meta_data->>'provider', raw_app_meta_data->'providers'
    INTO v_correo, v_confirmado, v_proveedor, v_proveedores
    FROM auth.users
    WHERE id = v_auth;

    IF v_correo IS NULL THEN
        RETURN jsonb_build_object('resultado', 'sin_correo');
    END IF;

    -- CORREGIDO: se usa la funcion unica del correo admin
    v_es_admin :=
        v_correo = public.correo_admin()
        AND v_confirmado IS NOT NULL
        AND (
            v_proveedor = 'google'
            OR COALESCE(v_proveedores, '[]'::JSONB) ? 'google'
        );

    IF v_es_admin THEN
        IF COALESCE(btrim(p_apellido), '') = ''
           OR p_fecha_nacimiento IS NULL
           OR COALESCE(btrim(p_genero), '') = ''
           OR COALESCE(btrim(p_ubicacion), '') = ''
           OR COALESCE(btrim(p_foto_perfil), '') = '' THEN
            RETURN jsonb_build_object('resultado', 'datos_admin_incompletos');
        END IF;
        v_nombre_rol := 'admin';
    END IF;

    SELECT id INTO v_id_rol FROM public.roles WHERE nombre_rol = v_nombre_rol;

    IF v_id_rol IS NULL THEN
        RETURN jsonb_build_object('resultado', 'rol_no_encontrado');
    END IF;

    INSERT INTO public.usuarios (
        auth_usuario, id_rol, nombre, apellido, numero, correo,
        fecha_nacimiento, genero, ubicacion, foto_perfil, fecha_creado
    )
    VALUES (
        v_auth, v_id_rol, btrim(p_nombre),
        COALESCE(NULLIF(btrim(p_apellido), ''), ''),
        btrim(p_numero), v_correo, p_fecha_nacimiento,
        NULLIF(btrim(p_genero), ''), NULLIF(btrim(p_ubicacion), ''),
        NULLIF(btrim(p_foto_perfil), ''), NOW()
    )
    RETURNING id_usuario INTO v_id_usuario;

    RETURN jsonb_build_object('resultado', 'creado', 'id_usuario', v_id_usuario, 'rol', v_nombre_rol);

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('resultado', 'correo_duplicado');
END;
$$;

-- correo_admin() es interna, pero crear_mi_usuario (SECURITY DEFINER) la puede llamar.
REVOKE ALL ON FUNCTION public.crear_mi_usuario(VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_mi_usuario(VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR) TO authenticated;
