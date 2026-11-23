// ===================================
// TennisWorld — Profile Page
// ===================================
// The account lives on /me. This page stays public and does not read a token.

(function () {
    'use strict';

    function clearLegacyAuthKeys() {
        try {
            localStorage.removeItem('tw-auth-token');
            localStorage.removeItem('tw-auth-user');
        } catch { /* private mode */ }
    }

    document.addEventListener('DOMContentLoaded', clearLegacyAuthKeys);
}());
