# openWB

L'intégration amène une borne **openWB 2.x** dans Gladys, en local, par le broker MQTT qui tourne sur l'openWB.
Elle suit en direct chaque point de charge (branché, en charge, puissance, énergie), les compteurs réseau, solaire
et batterie que l'openWB connaît, déclenche des scènes quand un véhicule est branché ou qu'une charge se termine,
et peut changer le mode de charge et l'intensité de la charge immédiate.

> Développée sans le matériel, à partir du code source d'openWB 2 (openWB/core) et testée contre un vrai broker
> Mosquitto qui rejoue ses topics : vos retours sont les bienvenus.

## Prérequis

- Une openWB avec le logiciel **2.x** (série 2, Pro, ou toute openWB passée en 2.x). Le logiciel 1.9 utilise
  d'autres topics et n'est pas pris en charge.
- Gladys 5.1 ou plus récent, sur le même réseau que l'openWB.
- L'accès au broker de l'openWB :
  - **port 1883 (non chiffré)** : dans l'openWB, sous _System → Sicherheit_, activez _Unverschlüsselten Zugang
    erlauben_ ;
  - ou **port 8883 avec TLS**, ouvert par défaut : cochez _TLS_ dans l'intégration. L'openWB utilise un
    certificat auto-signé, que l'intégration accepte.
- Si la gestion des utilisateurs de l'openWB (_Benutzerverwaltung_) est active : port 8883 avec TLS (l'openWB
  ferme alors le port 1883), un utilisateur openWB et son mot de passe. Pour changer de mode, cet utilisateur doit
  pouvoir écrire sur ses points de charge.

## Configuration

| Champ                              | Ce qu'il faut saisir                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Adresse de l'openWB                | Adresse IP ou nom d'hôte de l'openWB, par exemple `192.168.1.30`         |
| Port MQTT                          | `1883` (non chiffré) ou `8883` (TLS)                                     |
| TLS                                | Coché pour le port 8883                                                  |
| Utilisateur et mot de passe MQTT   | Seulement avec la gestion des utilisateurs de l'openWB                   |
| Autoriser le pilotage              | Désactivé par défaut : permet à Gladys de changer le mode et l'intensité |
| Langue des noms de fonctionnalités | Utilisée une fois, à la création des appareils ; français par défaut     |

Utilisez ensuite **Tester la connexion** : elle liste les points de charge signalés par l'openWB. Les appareils
apparaissent dans l'onglet **Découverte** de l'intégration : ajoutez ceux que vous voulez.

**L'arrêt est toujours permis**, même pilotage désactivé : arrêter une charge n'est jamais dangereux. Les autres
modes et l'intensité demandent _Autoriser le pilotage_.

## Les appareils

### Point de charge

Un appareil par point de charge de l'openWB, nommé comme dans l'openWB :

- **Mode de charge** (pilotable) : Immédiate, Solaire, Éco, Objectif, Arrêt. Le _Min + PV_ d'openWB est le mode
  Solaire avec une intensité minimale réglée dans son profil de charge ;
- **Véhicule branché**, **État de la charge** (en charge, branché, pause du véhicule, en attente de l'openWB,
  libre) ;
- **Puissance de charge** (kW), **Intensité de charge** (A, phase la plus chargée) ;
- **Intensité en charge immédiate** (pilotable, 6 à 32 A) : l'intensité du mode Immédiate ;
- **Énergie de la session** (kWh) : l'énergie de la session en cours, conservée après le débranchement ;
- **Compteur de la borne** (kWh) : le compteur du point de charge, utilisable par le module énergie de Gladys ;
- **Batterie du véhicule** (%), seulement quand l'openWB la connaît (module SoC du véhicule, ou borne qui la lit).

### Site openWB

Créé quand l'openWB mesure l'un de ces éléments :

- **Réseau** (W, import positif, export négatif), **Import réseau** et **Export réseau** (compteurs en kWh) ;
- **Consommation maison** (W) ;
- **Production solaire** (W) et **Production solaire cumulée** (compteur en kWh) ;
- **Batterie maison** (%), **Charge batterie** et **Décharge batterie** (W).

## Widget du tableau de bord

Le widget **openWB** affiche solaire, maison et réseau en tuiles, une ligne par point de charge (état, puissance,
batterie, mode) et la batterie maison, et des boutons de mode pour un point de charge (choisi dans les réglages du
widget, sinon le premier) : Immédiate, Solaire, Éco et Arrêt pilotage autorisé, Arrêt seul sinon. Le mode en
cours porte une coche. Trois réglages masquent les tuiles, les lignes des points de charge et les boutons.

## Déclencheurs de scène

| Déclencheur        | Quand                                                               | Variables                                    |
| ------------------ | ------------------------------------------------------------------- | -------------------------------------------- |
| Véhicule branché   | Un véhicule est branché sur un point de charge                      | point de charge, véhicule                    |
| Véhicule débranché | Un véhicule est débranché                                           | point de charge, véhicule, énergie (kWh)     |
| Charge démarrée    | Une charge démarre (une courte pause n'est pas une nouvelle charge) | point de charge, véhicule                    |
| Charge terminée    | Une charge est arrêtée depuis 10 minutes, ou le véhicule débranché  | point de charge, véhicule, énergie, batterie |

Chaque déclencheur peut se limiter à un point de charge ; _Charge démarrée_ aussi à un mode. Le véhicule est celui
que l'openWB a affecté au point de charge. La batterie vaut -1 quand l'openWB ne la connaît pas.

## Actions de scène

- **Changer le mode de charge** d'un point de charge. L'arrêt est toujours permis, les autres modes demandent le
  pilotage.
- **Régler l'intensité en charge immédiate** (6 à 32 A), pilotage autorisé.

L'intégration attend que l'openWB ait appliqué le changement (15 secondes au plus) ; sinon l'action échoue avec un
message.

## Exemples de scènes

- À 22 h, passer en mode Immédiate (heures creuses), et revenir en Solaire à 6 h.
- Quand une charge est terminée, envoyer un message avec l'énergie chargée.
- Quand le prix du réseau est élevé (autre intégration), passer le point de charge en Arrêt.

## Dépannage

- **« Le broker MQTT de l'openWB ne répond pas »** : vérifiez l'adresse, et que l'accès non chiffré est autorisé
  dans l'openWB pour le port 1883 (ou utilisez 8883 avec TLS).
- **« a refusé le nom d'utilisateur ou le mot de passe »** : la gestion des utilisateurs de l'openWB est active ;
  utilisez le port 8883 avec TLS et un utilisateur openWB.
- **« aucune donnée openWB 2.x »** : le broker répond mais ne publie aucun topic `openWB/...`. Est-ce bien une
  openWB 2 ? Le logiciel 1.9 n'est pas pris en charge.
- **« L'openWB n'a pas appliqué le changement »** : l'openWB ne fait pas tourner sa régulation, ou l'utilisateur
  MQTT ne peut pas écrire sur ce point de charge.

## Limites

- openWB 2.x seulement, par son broker MQTT ; pas de cloud.
- Changer le mode ou l'intensité modifie le **profil de charge** actif sur le point de charge, comme la simple API
  d'openWB. Si d'autres points de charge ou véhicules partagent ce profil, l'openWB leur applique aussi le
  changement (sauf si ses « profils de charge temporaires » sont actifs).
- **L'arrêt ne demande pas le pilotage, et il dure** : sans profils de charge temporaires, il est enregistré dans le
  profil du véhicule ; on en sort depuis l'openWB, ou en autorisant le pilotage dans Gladys. Avec les profils
  temporaires, l'openWB revient au profil du véhicule au débranchement : un mode choisi depuis Gladys s'arrête avec
  la session.
- Les plans de charge à objectif, la charge programmée et les réglages de batterie ne se modifient pas depuis
  Gladys.
- Développée sans le matériel : vos retours sont les bienvenus sur le forum.
