# openWB

La integración trae un cargador **openWB 2.x** a Gladys, en local, por el broker MQTT que funciona en la openWB.
Sigue en directo cada punto de carga (conectado, cargando, potencia, energía), los contadores de red, solar y
batería que conoce la openWB, activa escenas cuando se conecta un vehículo o termina una carga, y puede cambiar el
modo de carga y la intensidad de la carga inmediata.

> Desarrollada sin el hardware, a partir del código fuente de openWB 2 (openWB/core) y probada con un broker
> Mosquitto real que reproduce sus topics: sus comentarios son bienvenidos.

## Requisitos

- Una openWB con el software **2.x** (serie 2, Pro, o cualquier openWB actualizada a 2.x). El software 1.9 usa
  otros topics y no es compatible.
- Gladys 5.1 o posterior, en la misma red que la openWB.
- Acceso al broker de la openWB:
  - **puerto 1883 (sin cifrar)**: en la openWB, en _System → Sicherheit_, active _Unverschlüsselten Zugang
    erlauben_;
  - o **puerto 8883 con TLS**, abierto por defecto: marque _TLS_ en la integración. La openWB usa un certificado
    autofirmado, que la integración acepta.
- Si la gestión de usuarios de la openWB (_Benutzerverwaltung_) está activa: puerto 8883 con TLS (la openWB cierra
  entonces el puerto 1883), un usuario de openWB y su contraseña. Para cambiar de modo, este usuario debe poder
  escribir en sus puntos de carga.

## Configuración

| Campo                              | Qué introducir                                                      |
| ---------------------------------- | ------------------------------------------------------------------- |
| Dirección de openWB                | Dirección IP o nombre de host de la openWB, p. ej. `192.168.1.30`   |
| Puerto MQTT                        | `1883` (sin cifrar) o `8883` (TLS)                                  |
| TLS                                | Marcado para el puerto 8883                                         |
| Usuario y contraseña MQTT          | Solo con la gestión de usuarios de la openWB                        |
| Permitir el control                | Desactivado por defecto: permite a Gladys cambiar modo e intensidad |
| Idioma de los nombres de funciones | Se usa una vez, al crear los dispositivos; francés por defecto      |

Use luego **Probar la conexión**: lista los puntos de carga que informa la openWB. Los dispositivos aparecen en la
pestaña **Descubrimiento** de la integración: añada los que desee.

**Parada siempre se permite**, incluso con el control desactivado: detener una carga nunca es peligroso. Los demás
modos y la intensidad requieren _Permitir el control_.

## Los dispositivos

### Punto de carga

Un dispositivo por punto de carga de la openWB, con el nombre que tiene en la openWB:

- **Modo de carga** (controlable): Inmediata, Solar, Eco, Objetivo, Parada. El _Min + PV_ de openWB es el modo
  Solar con una intensidad mínima en su perfil de carga;
- **Vehículo conectado**, **Estado de la carga** (cargando, conectado, pausa del vehículo, esperando a la openWB,
  libre);
- **Potencia de carga** (kW), **Intensidad de carga** (A, fase más alta);
- **Intensidad de carga inmediata** (controlable, 6 a 32 A): la intensidad del modo Inmediata;
- **Energía de la sesión** (kWh): la energía de la sesión en curso, conservada tras desconectar;
- **Contador del cargador** (kWh): el contador del punto de carga, utilizable por el módulo de energía de Gladys;
- **Batería del vehículo** (%), solo cuando la openWB la conoce (módulo SoC del vehículo, o un cargador que la lee).

### Sitio openWB

Se crea cuando la openWB mide alguno de estos elementos:

- **Red** (W, importación positiva, exportación negativa), **Importación de red** y **Exportación a red**
  (contadores en kWh);
- **Consumo de la casa** (W);
- **Producción solar** (W) y **Producción solar acumulada** (contador en kWh);
- **Batería de la casa** (%), **Batería cargando** y **Batería descargando** (W).

## Widget del panel

El widget **openWB** muestra solar, casa y red en mosaicos, una línea por punto de carga (estado, potencia,
batería, modo) y la batería de la casa, y botones de modo para un punto de carga (elegido en los ajustes del
widget, si no el primero): Inmediata, Solar, Eco y Parada con el control permitido, solo Parada si no. El modo
actual lleva una marca. Tres ajustes ocultan los mosaicos, las líneas de los puntos de carga y los botones.

## Disparadores de escena

| Disparador            | Cuándo                                                         | Variables                                  |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| Vehículo conectado    | Un vehículo se conecta a un punto de carga                     | punto de carga, vehículo                   |
| Vehículo desconectado | Un vehículo se desconecta                                      | punto de carga, vehículo, energía (kWh)    |
| Carga iniciada        | Una carga empieza (una pausa corta no es una carga nueva)      | punto de carga, vehículo                   |
| Carga terminada       | Una carga lleva 10 minutos parada, o el vehículo se desconectó | punto de carga, vehículo, energía, batería |

Cada disparador puede limitarse a un punto de carga; _Carga iniciada_ también a un modo. El vehículo es el que la
openWB asignó al punto de carga. La batería vale -1 cuando la openWB no la conoce.

## Acciones de escena

- **Cambiar el modo de carga** de un punto de carga. Parada siempre se permite, los demás modos requieren el
  control.
- **Fijar la intensidad de carga inmediata** (6 a 32 A), con el control permitido.

La integración espera a que la openWB haya aplicado el cambio (15 segundos como máximo); si no, la acción falla con
un mensaje.

## Ejemplos de escenas

- A las 22:00, pasar al modo Inmediata (horas valle), y volver a Solar a las 6:00.
- Cuando termina una carga, enviar un mensaje con la energía cargada.
- Cuando el precio de la red es alto (otra integración), poner el punto de carga en Parada.

## Solución de problemas

- **«El broker MQTT de openWB no responde»**: compruebe la dirección, y que el acceso sin cifrar está permitido en
  la openWB para el puerto 1883 (o use 8883 con TLS).
- **«rechazó el nombre de usuario o la contraseña»**: la gestión de usuarios de la openWB está activa; use el puerto
  8883 con TLS y un usuario de openWB.
- **«sin datos de openWB 2.x»**: el broker responde pero no publica ningún topic `openWB/...`. ¿Es una openWB 2? El
  software 1.9 no es compatible.
- **«openWB no aplicó el cambio»**: la regulación de la openWB no está en marcha, o el usuario MQTT no puede
  escribir en este punto de carga.

## Limitaciones

- Solo openWB 2.x, por su broker MQTT; sin nube.
- Cambiar el modo o la intensidad modifica el **perfil de carga** activo en el punto de carga, como la simpleAPI de
  openWB. Si otros puntos de carga o vehículos comparten este perfil, la openWB también les aplica el cambio (salvo
  si sus «perfiles de carga temporales» están activos).
- **Parada no requiere el control, y perdura**: sin perfiles de carga temporales, se guarda en el perfil del
  vehículo; salga de ella desde la openWB, o permita el control en Gladys. Con perfiles temporales, la openWB vuelve
  al perfil del vehículo al desconectarlo: un modo elegido desde Gladys termina con la sesión.
- Los planes de carga con objetivo, la carga programada y los ajustes de batería no se modifican desde Gladys.
- Desarrollada sin el hardware: sus comentarios son bienvenidos en el foro.
