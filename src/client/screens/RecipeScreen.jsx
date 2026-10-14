import { useState } from 'react';
import { formatAmount, scaleRecipe } from '../../shared/units.js';

export default function RecipeScreen({ recipe }) {
  const [portions, setPortions] = useState(recipe.basePortions);
  const scaled = scaleRecipe(recipe, portions);

  return (
    <article>
      <h1>{recipe.title}</h1>
      {recipe.allergens.length > 0 && <p role="note">Allergens: {recipe.allergens.join(', ')}</p>}
      <div className="portions">
        <button type="button" aria-label="Fewer portions" disabled={portions <= 1} onClick={() => setPortions(portions - 1)}>
          -
        </button>
        <span>{portions === 1 ? '1 portion' : `${portions} portions`}</span>
        <button type="button" aria-label="More portions" disabled={portions >= 12} onClick={() => setPortions(portions + 1)}>
          +
        </button>
      </div>
      <ul>
        {scaled.ingredients.map((i) => (
          <li key={i.name}>
            <span>{formatAmount(i.grams)}</span> <span>{i.name}</span>
            {!i.inList && <span className="tag"> not in your list</span>}
          </li>
        ))}
      </ul>
      <ol>
        {recipe.steps.map((step, n) => (
          <li key={n}>{step}</li>
        ))}
      </ol>
    </article>
  );
}
