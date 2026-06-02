import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabaseClient } from '../context/AppContext';
import { acceptInvitation } from '../utils/invitationService';
import LoadingSpinner from '../components/LoadingSpinner';
import Icon from '../components/Icon';

function AcceptInvitationView() {
    const { token } = useParams();
    const navigate = useNavigate();
    const [invitation, setInvitation] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isAccepting, setIsAccepting] = useState(false);
    
    // Auth state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isSignUp, setIsSignUp] = useState(true);

    useEffect(() => {
        loadInvitation();
    }, [token]);

    const loadInvitation = async () => {
        try {
            const { data: invitationRow, error: rpcError } = await supabaseClient
                .rpc('get_invitation_by_token', { invitation_token_param: token });
            const data = Array.isArray(invitationRow) ? invitationRow[0] : invitationRow;
            const error = rpcError;

            if (error || !data) {
                setError('This invitation link is no longer valid. Please sign in with your account. If you were recently invited, check your email for a new invitation link from SiteWeave.');
                setIsLoading(false);
                return;
            }

            // Optionally load project/issue names (user may be anon; RLS may block — keep optional)
            let enriched = data;
            if (data.project_id && supabaseClient) {
                const { data: proj } = await supabaseClient.from('projects').select('name, address').eq('id', data.project_id).maybeSingle();
                const { data: issue } = data.issue_id ? await supabaseClient.from('project_issues').select('title, description').eq('id', data.issue_id).maybeSingle() : { data: null };
                enriched = { ...data, projects: proj ? { name: proj.name, address: proj.address } : null, project_issues: issue ? { title: issue.title, description: issue.description } : null };
            }
            const dataToUse = enriched;

            // Check if expired
            if (dataToUse.expires_at && new Date(dataToUse.expires_at) < new Date()) {
                setError('This invitation has expired');
                setIsLoading(false);
                return;
            }

            // Check if already accepted
            if (dataToUse.status === 'accepted') {
                setError('This invitation has already been accepted');
                setIsLoading(false);
                return;
            }

            setInvitation(dataToUse);
            setEmail(dataToUse.email || ''); // Pre-fill email
            setIsLoading(false);
        } catch (err) {
            console.error('Error loading invitation:', err);
            setError('Failed to load invitation');
            setIsLoading(false);
        }
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        setIsAccepting(true);

        try {
            // Sign up the user
            const { data: authData, error: signUpError } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName
                    }
                }
            });

            if (signUpError) {
                setError(signUpError.message || 'Failed to create account. Please try again.');
                setIsAccepting(false);
                return;
            }

            if (!authData?.user) {
                setError('Account created but user data is missing. Please try signing in.');
                setIsAccepting(false);
                return;
            }

            // Accept the invitation
            const result = await acceptInvitation(token, authData.user.id);

            if (!result.success) {
                setError(result.error || 'Failed to accept invitation. Please contact the project manager.');
                setIsAccepting(false);
                return;
            }

            // Navigate to the project
            if (result.projectId) {
                navigate(`/projects/${result.projectId}`);
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            console.error('Error accepting invitation:', err);
            setError(err.message);
            setIsAccepting(false);
        }
    };

    const handleSignIn = async (e) => {
        e.preventDefault();
        setIsAccepting(true);

        try {
            // Sign in the user
            const { data: authData, error: signInError } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (signInError) {
                setError(signInError.message || 'Invalid email or password. Please try again.');
                setIsAccepting(false);
                return;
            }

            if (!authData?.user) {
                setError('Sign in failed. Please try again.');
                setIsAccepting(false);
                return;
            }

            // Accept the invitation
            const result = await acceptInvitation(token, authData.user.id);

            if (!result.success) {
                setError(result.error || 'Failed to accept invitation. Please contact the project manager.');
                setIsAccepting(false);
                return;
            }

            // Navigate to the project
            if (result.projectId) {
                navigate(`/projects/${result.projectId}`);
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            console.error('Error accepting invitation:', err);
            setError(err.message);
            setIsAccepting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-purple-50">
                <LoadingSpinner size="lg" text="Loading invitation..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-purple-50 p-4">
                <div className="max-w-md w-full app-card shadow-lg p-8 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon path="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="px-6 py-2 app-action-primary rounded-lg transition-colors"
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-purple-50 p-4">
            <div className="max-w-4xl w-full grid md:grid-cols-2 gap-0 app-card shadow-xl overflow-hidden">
                {/* Left Side - Invitation Details */}
                <div className="bg-linear-to-br from-blue-600 to-purple-600 p-8 text-white flex flex-col justify-center">
                    <div className="mb-6">
                        <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mb-4">
                            <Icon path="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold mb-2">You're Invited!</h1>
                        <p className="text-blue-100 text-lg">Join your team on SiteWeave</p>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                            <p className="text-sm text-blue-100 mb-1">Project</p>
                            <p className="font-semibold text-lg">{invitation?.projects?.name}</p>
                            {invitation?.projects?.address && (
                                <p className="text-sm text-blue-100 mt-1">{invitation.projects.address}</p>
                            )}
                        </div>

                        {invitation?.project_issues && (
                            <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                                <p className="text-sm text-blue-100 mb-1">Task Assignment</p>
                                <p className="font-semibold">{invitation.project_issues.title}</p>
                                <p className="text-sm text-blue-100 mt-1">{invitation.project_issues.description}</p>
                            </div>
                        )}

                        <div className="flex items-start gap-3 pt-4">
                            <Icon path="M5 13l4 4L19 7" className="w-5 h-5 text-green-300 mt-0.5" />
                            <div>
                                <p className="font-medium">Instant Collaboration</p>
                                <p className="text-sm text-blue-100">Access project files, tasks, and team communication</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side - Auth Form */}
                <div className="p-8 flex flex-col justify-center">
                    <div className="mb-6">
                        <div className="flex gap-2 mb-6">
                            <button type="button"
                                onClick={() => setIsSignUp(true)}
                                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                                    isSignUp 
                                        ? 'bg-blue-600 text-white' 
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                Sign Up
                            </button>
                            <button type="button"
                                onClick={() => setIsSignUp(false)}
                                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                                    !isSignUp 
                                        ? 'bg-blue-600 text-white' 
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                Sign In
                            </button>
                        </div>

                        <h2 className="text-2xl font-bold text-gray-900 mb-2">
                            {isSignUp ? 'Create Your Account' : 'Welcome Back'}
                        </h2>
                        <p className="text-gray-600">
                            {isSignUp 
                                ? 'Get started with SiteWeave' 
                                : 'Sign in to accept your invitation'}
                        </p>
                    </div>

                    <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
                        {isSignUp && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                    placeholder="John Doe"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                                disabled={isSignUp} // Email is pre-filled for invitations
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                                minLength={6}
                                placeholder={isSignUp ? 'Create a password (min. 6 characters)' : 'Enter your password'}
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isAccepting}
                            className="w-full py-3 app-action-primary rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isAccepting ? (
                                <>
                                    <LoadingSpinner size="sm" text="" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    {isSignUp ? 'Accept Invitation & Sign Up' : 'Accept Invitation & Sign In'}
                                    <Icon path="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="text-xs text-gray-500 text-center mt-6">
                        By signing up, you agree to our Terms of Service and Privacy Policy
                    </p>
                </div>
            </div>
        </div>
    );
}

export default AcceptInvitationView;



















