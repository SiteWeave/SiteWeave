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
      <header className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team directory</h1>
          <p className="text-sm text-gray-500">
            Find people on your projects. Open a project stream to post updates.
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ContactsView embedded />
      </div>
    </div>
  );
}

export default TeamHubView;
