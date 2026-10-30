# 🇫🇷  Widget de filtres avancés pour Grist

Ce widget permet d'ajouter des filtres dynamiques et personnalisables à vos documents Grist. Il offre une interface intuitive pour filtrer les données en utilisant des listes déroulantes et des tags.

---

## Fonctionnalités

- **Filtres dynamiques** : Filtrez vos données en utilisant des listes déroulantes pour les choix uniques ou des tags pour les choix multiples.
- **Recherche globale** : Recherchez dans toutes les colonnes à l'aide d'une barre de recherche globale.
- **Gestion des filtres** : Choisissez quels filtres afficher ou masquer via une interface modale. Vous pouvez également modifier leur position par un *click and drop*
- **État persistant** : Les filtres sélectionnés et leur visibilité sont sauvegardés dans le navigateur et restaurés lors du rechargement de la page.

---

## Installation

1. **Copiez l'adresse du widget**

[https://sylvainbesson1.github.io/Widget-drop-down-filter/
](https://sylvainbesson1.github.io/Widget-Advanced-Filter)

2. **Colles l'adresse d'adresse dans les widgets personnalisées** :
   - Cliquez sur nouveau
   - Ajoutez une page ou ajouter une vue la page
   - Choisissez la vue personnalisée et les données sources
   - Collez l'URL dans le Widget "Ajouter votre propre widget"
   - Selectionnez le niveau d'accès complet au document
  
3. **Cliquez sur le tableau que vous souhaitez filtrer**
   - Sur le volet de droite, dans table, aller "Données source"
   - Selectionner par la vue du filtrer
---

## Configuration

Le widget détecte automatiquement les colonnes de type `Choice`, `ChoiceList`, `Reference` et `ReferenceList`. 

## Exemple d'utilisation

[Base de données des outils](https://grist.numerique.gouv.fr/o/docs/mjRH56o7CwaC/Base-de-donnees-des-outils) (en cours de création) produit par l'atelier de la donnée [DataLyStE](https://datalyste.universite-lyon.fr/). 


---------------------------------------------------------------








# 🇬🇧  Advanced filters widget for Grist

This widget allows you to add dynamic and customizable filters to your Grist documents. It provides an intuitive interface for filtering data using dropdown lists and tags.

---

## Features

- **Dynamic Filters**: Filter your data using dropdown lists for single choices or tags for multiple choices.
- **Global Search**: Search across all columns using a global search bar.
- **Filter Management**: Choose which filters to display or hide via a modal interface. You can also modify their position using *click and drag*.
- **Persistent State**: Selected filters and their visibility are saved in the browser and restored upon page reload.

---

## Installation

1. **Copy the widget address**:

   https://sylvainbesson1.github.io/Widget-drop-down-filter/

2. **Paste the address into custom widgets**:
   - Click on "New"
   - Add a page or add a view to the page
   - Choose the custom view and data sources
   - Paste the URL in the "Add your own widget" section
   - Select the full document access level

3. **Click on the table you want to filter**:
   - In the right panel, under "Table," go to "Data Source"
   - Select the view to filter

---

## Configuration

The widget automatically detects columns of type `Choice`, `ChoiceList`, `Reference`, and `ReferenceList`.

---

## Usage

1. **Filter Data**:
   - Use dropdown lists to select specific values.
   - Click on tags to enable or disable corresponding filters.

2. **Global Search**:
   - Use the search bar to filter data based on keywords.

3. **Manage Filters**:
   - Click on the "Manage Filters" button to open the management modal.
   - Select or deselect filters you want to display.

4. **Reset Filters**:
   - Use the "Reset" button to clear all applied filters.

---

## Example

Here is an example of how to configure and use the widget:

1. **Add the widget** to a custom page in your Grist document.
2. **Customize the columns** by modifying the lists `knownChoiceColumns`, `knownChoiceListColumns`, etc.
3. **Use the filters** to refine the results displayed in your table.

---

## Troubleshooting

- **No filters appear**: Ensure the columns you want to filter are of type `Choice`, `ChoiceList`, `Reference`, or `ReferenceList`.
- **Filters are not applied**: Make sure the column names in the code exactly match those in your Grist document.
- **Console errors**: Check the error messages to identify and fix issues.

---

## Use case

[Tools database](https://grist.numerique.gouv.fr/o/docs/mjRH56o7CwaC/Base-de-donnees-des-outils) (currently being created) produced by[DataLyStE](https://datalyste.universite-lyon.fr/). 
