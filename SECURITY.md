# Security

BYOK Runtime receives provider credentials only as call inputs. It does not persist API keys or local provider settings.

Use this package from trusted server, desktop backend, local, or main-process contexts. Browser and Electron renderer UIs should call through a trusted host boundary instead of importing BYOK Runtime directly with provider credentials.

Please report security issues privately through GitHub Security Advisories for this repository.
