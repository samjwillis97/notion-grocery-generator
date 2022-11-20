import * as dotenv from "dotenv";
import { Client } from "@notionhq/client";

dotenv.config();
const notion = new Client({ auth: process.env.NOTION_KEY });

async function getWeeklyGroceryIds() {
  const mealsDb = await notion.databases.retrieve({
    database_id: process.env.MEAL_DATABASE_ID,
  });
  const mealsGroceryPropertyId = mealsDb.properties.Ingredients.id;

  const thisWeekItems = await notion.databases.query({
    database_id: process.env.THIS_WEEK_DATABASE_ID,
  });
  const pages = thisWeekItems;
  const mealsPropertyId = thisWeekItems.results[0].properties["Meals"]["id"];

  const groceries = [];

  for (let i = 0; i < pages.results.length; i++) {
    const pageId = pages.results[i].id;
    const meals = await notion.pages.properties.retrieve({
      page_id: pageId,
      property_id: mealsPropertyId,
    });

    if (meals.results) {
      for (let j = 0; j < meals.results.length; j++) {
        const meal = await notion.pages.retrieve({
          page_id: meals.results[j].relation.id,
        });
        const mealGroceries = await notion.pages.properties.retrieve({
          page_id: meals.results[j].relation.id,
          property_id: mealsGroceryPropertyId,
        });
        mealGroceries.results.forEach((v) => {
          groceries.push({
            id: v.relation.id,
            meal: meal.properties.Name.title[0].plain_text,
          });
        });
      }
    }
  }

  const regularGroceries = await notion.databases.query({
    database_id: process.env.MASTER_LIST_DATABASE_ID,
    filter: {
      or: [
        {
          property: "Regular",
          checkbox: {
            equals: true,
          },
        },
      ],
    },
  });

  for (let i = 0; i < regularGroceries.results.length; i++) {
    groceries.push({
      id: regularGroceries.results[i].id,
      meal: "Regular",
    });
  }

  return groceries;
}

async function getGroupedGroceries(groceries) {
  // Maybe could be replaced with some sort of query?
  // Should reduce the array combine same ids
  const groceryIdMappedToMeals = new Map();
  for (let i = 0; i < groceries.length; i++) {
    if (groceryIdMappedToMeals.has(groceries[i].id)) {
      const current = groceryIdMappedToMeals.get(groceries[i].id);
      current.push(groceries[i].meal);
      groceryIdMappedToMeals.set(groceries[i].id, current);
    } else {
      groceryIdMappedToMeals.set(groceries[i].id, [groceries[i].meal]);
    }
  }

  const groceryGroups = {};

  for (let v of groceryIdMappedToMeals) {
    const key = v[0];
    const meals = v[1];
    const grocery = await notion.pages.retrieve({
      page_id: key,
    });
    const name =
      grocery.properties.Name.title[0].text.content +
      "   (" +
      meals.join(", ") +
      ")";
    const group = grocery.properties.Aisle.select.name;

    if (groceryGroups[group]) {
      groceryGroups[group].push(name);
    } else {
      groceryGroups[group] = [name];
    }
  }

  return groceryGroups;
}

async function createGroceryPage(groceries) {
  const date = new Date();

  let day = date.getDate();
  let month = date.getMonth() + 1;
  let year = date.getFullYear();

  const blocks = [];
  for (const key in groceries) {
    if (!groceries[key]) {
      continue;
    }

    blocks.push({
      object: "block",
      heading_3: {
        rich_text: [
          {
            text: {
              content: key,
            },
          },
        ],
      },
    });

    for (const i in groceries[key]) {
      blocks.push({
        object: "block",
        to_do: {
          rich_text: [
            {
              type: "text",
              text: {
                content: groceries[key][i],
                link: null,
              },
            },
          ],
          checked: false,
          color: "default",
        },
      });
    }
  }

  const response = await notion.pages.create({
    properties: {
      title: [
        {
          text: {
            content: `Grocery List ${day}-${month}-${year}`,
          },
        },
      ],
    },
    icon: {
      type: "emoji",
      emoji: "🥬",
    },
    parent: {
      page_id: process.env.MEAL_PLANNING_DATABASE_ID,
    },
    children: blocks,
  });

  return response.id;
}

// This shoudl return the id with the meal
const groceryIds = await getWeeklyGroceryIds();
// this should return grouped groceries and the meals they are being used in
const groceries = await getGroupedGroceries(groceryIds);
// console.log(groceries);
const groceryPage = await createGroceryPage(groceries);
console.log(groceryPage);
