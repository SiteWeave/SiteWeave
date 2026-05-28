import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { getLocalizedContactStatus } from '@siteweave/i18n';
import LoadingSpinner from './LoadingSpinner';
import Avatar from './Avatar';

/**
 * Team Directory - "The Instant Directory"
 * Shows all members of the user's organization automatically
 * This is the "magic moment" where new users see their team
 */
function TeamDirectory() {
  const { t, i18n } = useTranslation();
  const { state } = useAppContext();
  const currentOrganization = state.currentOrganization;
  const user = state.user;
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentOrganization?.id && user?.id) {
      loadTeamMembers();
    }
  }, [currentOrganization?.id, user?.id]);

  const loadTeamMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select(`
          id,
          created_at,
          contacts!fk_profiles_contact (
            id,
            name,
            email,
            role,
            phone,
            avatar_url,
            status
          ),
          roles (
            name
          )
        `)
        .eq('organization_id', currentOrganization.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error('Error loading team members:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="mt-6">
      {teamMembers.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <p className="text-gray-500">{t('team.no_members_yet')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teamMembers.map((member) => (
            <div
              key={member.id}
              className={`bg-white shadow rounded-lg p-6 ${
                member.id === user.id ? 'border-2 border-blue-500' : ''
              }`}
            >
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  {member.contacts?.avatar_url ? (
                    <img
                      src={member.contacts.avatar_url}
                      alt={member.contacts?.name}
                      className="w-16 h-16 rounded-full"
                    />
                  ) : (
                    <Avatar name={member.contacts?.name || t('common.user')} size="lg" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {member.contacts?.name || t('team.unnamed_user')}
                    </h3>
                    {member.id === user.id && (
                      <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                        {t('team.you')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {member.roles?.name || t('team.team_member')}
                  </p>
                  {member.contacts?.role && (
                    <p className="text-sm text-gray-500">
                      {member.contacts.role}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {member.contacts?.email && (
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <a href={`mailto:${member.contacts.email}`} className="hover:text-blue-600">
                      {member.contacts.email}
                    </a>
                  </div>
                )}
                {member.contacts?.phone && (
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <a href={`tel:${member.contacts.phone}`} className="hover:text-blue-600">
                      {member.contacts.phone}
                    </a>
                  </div>
                )}
                {member.contacts?.status && (
                  <div className="flex items-center text-sm">
                    <span className={`w-2 h-2 rounded-full mr-2 ${
                      member.contacts.status === 'Available' ? 'bg-green-500' :
                      member.contacts.status === 'Busy' ? 'bg-yellow-500' :
                      'bg-gray-400'
                    }`}></span>
                    <span className="text-gray-600">{getLocalizedContactStatus(member.contacts.status, t)}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                {t('team.joined')} {new Date(member.created_at).toLocaleDateString(i18n.language)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TeamDirectory;
