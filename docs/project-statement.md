![Resultado de imagen para upc logo](data:image/jpeg;base64...)

# INGENIERIA DE SISTEMAS DE INFORMACIÓN

**CURSO: SI642 Finanzas e Ingeniería Económica ENUNCIADO DEL TRABAJO FINAL DEL CURSO**

**Fechas:**

- Carga de Evidencias de Evaluación Trabajo Parcial: Semana 6.
- Presentación del Trabajo Parcial: Semana 7.
- Carga de Evidencias de Evaluación Trabajo Parcial: Semana 14.
- Presentación del Trabajo Parcial: Semana 15.

**Enunciado**

El tema consistirá en el desarrollo de una aplicación Web o móvil, la que permita:

- Llevar de forma permanente el control de cuenta corriente por créditos otorgados por pequeños establecimientos.
- Los establecimientos ofrecen productos/servicios, a clientes ubicados geográficamente en su zona de influencia.
- Los establecimientos que se deberán tomar en cuenta, usualmente ocurre en supermercados de barrio, fruteros, carniceros, polleros, pescaderos, panaderos, bodegas, bazares, licorerías, peluquerías, spa, entre otros.
- Los clientes son los vecinos/residentes de la zona.
- Se debe considerar que el sistema deberá funcionar de manera genérica para cualquiera de estos tipos de negocio (o similares)
- Múltiples tiendas de distintos giros deben operar simultáneamente en la misma plataforma.

Para el desarrollo del aplicativo se podrán acoger a los usos y costumbres de cada negocio, por lo que debería de ser posible:

1. Permitir que el administrador del sistema pueda dar de alta/baja a una tienda. Ingresando todas sus credenciales y datos pertinente, así que, un cliente o administrador del negocio con su perfil a través del uso de una clave y usuario con la finalidad de hacer consultas del lado del cliente y administración de la información para el lado del administrador del negocio.

_El Administrador del negocio es un perfil diferente al del Administrador del Software o Plataforma Informática. Considerar mecanismos de seguridad en el Login y Logout, como contraseñas seguras, código de verificación mediante el uso del correo electrónico, código o imagen captcha, u otro autenticación multifactor._

2. Permitir que el administrador del negocio dé alta/baja a los productos/servicios que desee comercializar, pudiendo identificarlos de forma completa, el cual debe incluir no sólo proveedor (si es necesario), marca, descripción, unidad de medida, etc., sino también su imagen, precio contado, precio de lista (crédito) y si es posible que sea vendido en un solo pago al fin de mes (o fecha de corte) o en meses.

_Considerar el uso de catálogos, así como el manejo de inventarios de los productos/servicios._

3. Permitir que el administrador del negocio dé alta/baja a los posibles clientes registrados en la aplicación, ingresando no sólo todos sus datos generales, sino también y principalmente la tasa de interés pactada, la cual podrá ser nominal o efectiva, la moneda del crédito, el límite máximo de crédito y el máximo número de meses en el que se le podría dar el crédito y la fecha de corte del crédito mensual, así como la fecha de pago en la que todos los meses se compromete a pagar su deuda.

_Considerar mostrar la aceptación de la lectura de la Política de Seguridad y Privacidad de la Información Personal, así como el consentimiento por el registro y almacenamiento temporal de sus datos personales._

4. Tomar en cuenta que la forma de pago a realizar para los casos de pagos en meses será obligatoriamente utilizando el método francés vencido simple ordinario (tomando en cuenta meses de 30 días), debiendo tomar en cuenta que si se indica, por ejemplo 3 meses y su fecha de pago son los 26 de cada mes y si la compra se realizara el 15 de setiembre, que es anterior a la fecha de corte (que la fecha de corte sea por ejemplo el 20 de setiembre) se deberá tomar en cuenta que desde el 15 hasta el día 26 de setiembre existen 11 días de período de gracia total y por tanto la deuda deberá ser capitalizada antes de calcular la cuota mensual, por ejemplo si es a 3 meses, comenzando en el siguientes mes, o sea por el 26 de octubre, luego el 26 de noviembre y finalmente el 26 de diciembre.
5. Que todas las compras hechas para pagar a fin de mes y realizadas antes de la fecha y hora del día de corte y que se pagan hasta la fecha de pago pactada, deben pagar intereses por los días transcurridos entre la fecha de compra y la fecha de pago; así como, también se deberá pagar intereses por los días en exceso (días de mora) transcurridos entre la fecha de pago pactada hasta el día que efectivamente se realiza el pago. Si alguna compra se realiza después de la fecha de corte, su obligación de pago será en el mes inmediatamente posterior; asimismo, no debe permitirse compras que excedan el monto permitido para el cliente ni pagos parciales de deudas a la fecha de pago.
6. Tener en cuenta que el sistema debe generar en la fecha de corte, el listado de pago que debe realizar cada cliente en la fecha de pago pactada, en donde se detalle la lista de compras ordenadas por fecha, así como los intereses acumulados (calculados con tasas **nominales** o **efectivas**) por los días transcurridos entre la fecha de compra y la fecha de pago. En caso de pagos con días de mora, deberá ser detallado en un nuevo ítem e identificado como intereses por mora, los cuales comprenden los intereses moratorios del pago total que debería haber sido en una fecha determinada y los días transcurridos de mora, al cual se le aplica la tasa de interés moratoria pactada (**nominal** o **efectiva**)

Que no será necesario/obligatorio utilizar y no conforma parte del trabajo:

1. Que se mantenga tablas de inventarios o stock de productos.
2. Mantener información relacionada al pago de impuestos a la renta ni impuestos a las ventas, recuerde que esta aplicación pretende sustituir al cuaderno de notas típico que una bodega, botica o casero de barrio mantiene como contabilidad de deudas de sus clientes.

Finalmente, el desarrollo de la aplicación deberá estar enfocado desde el punto de vista del dueño del comercio que ofrece el crédito a sus clientes.

**Estructura del Informe Técnico**

**Objetivo:** Elaborar un informe (documentación técnica) en función a la información real conseguida para la construcción de su trabajo final (sea de fuentes públicas o privadas) y presentar obligatoriamente el siguiente esquema de desarrollo o contenido temático:

- **Introducción**.

_Del trabajo desarrollado_

- **Índice**.
- **Objetivo del Estudiante (Student Outcome)**.

_Adecuar los Outcomes conforme a la aplicación del presente trabajo en el curso_

- **Definiciones generales y conceptos básicos**.

_Tratados en el informe técnico y que sirven de base al desarrollo del contenido_

- **Marco Legal y Teórico.-**

El que nos permita conocer el marco normativo para el Perú, así como entender los conceptos y metodologías que se aplican en este caso.

Toda referencia a un contenido metodológico deberá estar referido a una norma legal, bibliografía o referencia web.

_Determinar la metodología para gestión de proyectos, así como la aplicación de un estándar para el ciclo de vida de software aplicado en el trabajo, así como de sus artefactos más representativos para el dominio del flujo del proceso de desarrollo: RUP, SCRUM, PMP, u otros. Considerar la aplicación de estándares relacionados al ciclo de vida del software: ITIL, ISO para Desarrollo de SW y/o Calidad de Sw, CMMI para Desarrollo de Sw, entre otros. Considerar estándares de base de datos basados en SQL como MySQL, Postgre SQL, entre otros. También considerar la regulación sobre Protección de Datos Personales y Privacidad, Seguridad de la Información y Transparencia._

- **Análisis y Diseño del Sistema.-** Siendo obligatoria la presentación de las siguientes partes:

_Desarrollar la Metodología de Gestión de Proyectos Informáticos y del Ciclo de Vida del Software._

- a. **Análisis de Datos.-** Que estará comprendida por:
  - **Datos de Entrada:** nombre y descripción de las constantes/variables, así como definición de tipos, tamaños, formatos, valores por defecto y sus respectivas restricciones.
  - **Datos de Salida:** nombre y descripción de las variables, así como definición de tipos, tamaños y formatos.
  - **Datos Intermedios:** nombre y descripción de las variables, así como definición de tipos, tamaños y formatos.

_Considerar los casos de uso de pruebas para los datos_

- b. **Diseño de la Interface.-**

Deberán presentar las pantallas que servirán para interactuar el usuario con el futuro sistema de información.

Esta etapa deberá incluir necesariamente el uso de un medio electrónico que permita recibir ayuda o indicaciones sobre la forma de uso del futuro sistema de información en cada uno de los campos de las ventanas de diálogo utilizadas.

_Considerar el modelo o lógica de seguridad y de redes – conectividad como parte de la Arquitectura de software. También, la incorporación de mecanismos de seguridad al Login – Logoff, transmisión de datos, trazabilidad, movimientos, cambios en la data, por ejemplo._

- c. **Marco conceptual (fórmulas).-** Deberán presentar el modelo matemático (fórmulas) que se utilizarán para la elaboración del plan de pagos, así como el cálculo de las cuotas de pago del reporte de deuda.
- d. **Diseño de Datos de prueba.-** Deberán presentar por lo menos 2 juegos de datos de prueba, los que permitan comprobar la veracidad del modelo desarrollado.

_Incorporar las técnicas y herramientas para la realización de las pruebas, como Caja Gris, Caja Blanca o Caja Negra; el Plan de Pruebas; Casos de Uso de Pruebas._

- **Algoritmo.-**

Deberán presentar el algoritmo de solución para el flujo de caja solicitado, en su modo de Pseudocódigo, Diagrama de Flujo o Diagrama de Nassi-Schneiderman. (tomar

en cuenta que algoritmo no es lo mismo que diagrama de procesos). Podrán utilizar cualquier herramienta que permita su visualización.

_Incorporar los Diagramas de Actividades o de Flujos de Información (o procesos)._

- **Modelo de la Base de datos.-**

Deberán presentar el modelo entidad-relación de la Base de Datos que utilizarán en la implementación de su solución.

_Diseñar e implementar un Modelo lógico – físico de datos con UML (Clases) o Entidad-Relación, realizar su diccionario de datos._

- **Sistema de información.-** Deberán implementar el análisis y diseño del sistema de información, para lo cual deberán utilizar cualquier lenguaje de programación orientado a desarrollo web o móvil. Para acceder a la aplicación, es obligatorio que usuario se inscriba con un login y password, así como registrar todas las operaciones realizadas en una base de datos.
  1.  Conectividad.
  2.  Base de datos.
  3.  Código fuente.
  4.  Ayuda y asistencia técnica.
  5.  Validación y pruebas.

- **Uso de Inteligencia artificial**.

Deberán detallar claramente los puntos del avance, informe o sistema implementado donde la IA a “formado parte del grupo”, dejando bien claro el porcentaje de ayuda o apoyo que recibieron, el nombre de la IA utilizada, el alumno del grupo que fue el puente en dicho uso. En caso no se incluya este requerimiento y/o sea identificado claramente con precisión el porcentaje que representa de lo trabajado (enumerando qué se le pidió, a qué herramienta, qué se aceptó, qué se corrigió y por qué) y el profesor del curso detecta “la ayudita”, todos los integrantes del grupo se harán merecedores a la nota de cero (00) en la presentación del trabajo. Ojo, no se pretende que no utilicen IA, por lo contrario, se pretende incorporarla formalmente al desarrollo de las aplicaciones que, por la naturaleza de la carrera, debe realizarse hoy y ahora, porque si no somos nosotros los que damos el ejemplo de su uso, quienes.

- **Anexos.**- Deberán adjuntar a la presentación de su informe final, la presentación de alto impacto académico/comercial de la aplicación, encartes, brochoures informativos u otros, en base a los cuales han desarrollado su aplicación web o móvil.
- **Bibliografía.**
