import { Link } from 'react-router-dom';
import { FullScreenMessage } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <FullScreenMessage
      emoji="🧐"
      title="Page not found"
      text="If you're at a cafe, please scan the QR code on your table again."
      action={<Link to="/" className="btn-primary">Go home</Link>}
    />
  );
}
