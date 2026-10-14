import { useState } from 'react';
import { ageInMonths } from '../../shared/age.js';

export default function SetupScreen({ onSave, now = () => new Date() }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  function submit(e) {
    e.preventDefault();
    try {
      ageInMonths(value, now());
    } catch (err) {
      setError(err.message);
      return;
    }
    onSave(value);
  }

  return (
    <form onSubmit={submit}>
      <h1>Welcome</h1>
      <p>Tell me your baby&apos;s birthday so recipes fit their age.</p>
      <label>
        Baby&apos;s birthday
        <input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Continue</button>
    </form>
  );
}
