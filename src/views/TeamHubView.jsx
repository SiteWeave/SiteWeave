import React, { useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import ContactsView from './ContactsView';

function TeamHubView() {
  const { dispatch } = useAppContext();

  useEffect(() => {
    dispatch({ type: 'SET_VIEW', payload: 'Contacts' });
  }, [dispatch]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ContactsView embedded />
    </div>
  );
}

export default TeamHubView;
