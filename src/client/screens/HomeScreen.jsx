import { useState } from 'react';
import { parseIngredientList } from '../../shared/ingredients.js';

export default function HomeScreen({ ageText, ingredients, onChange, onSuggest, loading, error, onShowLiked, usage = null }) {
  const [text, setText] = useState('');

  function add(e) {
    e.preventDefault();
    onChange(parseIngredientList([...ingredients, text]));
    setText('');
  }

  return (
    <section>
      <h1>What&apos;s in the fridge?</h1>
      <p>Baby is {ageText} old.</p>
      {usage && <p>Recipes today: {usage.recipesToday} of {usage.limit}</p>}
      <form onSubmit={add}>
        <label>
          Ingredient
          <input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit">Add</button>
      </form>
      <ul className="chips">
        {ingredients.map((name) => (
          <li key={name}>
            <span>{name}</span>
            <button type="button" aria-label={`Remove ${name}`} onClick={() => onChange(ingredients.filter((i) => i !== name))}>
              x
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={onSuggest} disabled={loading || ingredients.length === 0}>
        Suggest a recipe
      </button>
      {onShowLiked && (
        <button type="button" onClick={onShowLiked}>Liked recipes</button>
      )}
    </section>
  );
}
