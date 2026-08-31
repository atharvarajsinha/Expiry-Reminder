import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

import { Button } from '../components/common/Button.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found."
      description="The page you were looking for doesn't exist or has moved."
      action={
        <Button as={Link} to="/dashboard">
          Back to Dashboard
        </Button>
      }
    />
  );
}
