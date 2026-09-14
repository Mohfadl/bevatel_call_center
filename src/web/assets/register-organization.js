(() => {
    'use strict';

    const form =
        document.getElementById(
            'registerOrganizationForm',
        );

    const alertBox =
        document.getElementById(
            'alert',
        );

    const organizationNameInput =
        document.getElementById(
            'organizationName',
        );

    const organizationSlugInput =
        document.getElementById(
            'organizationSlug',
        );

    const nameInput =
        document.getElementById(
            'name',
        );

    const emailInput =
        document.getElementById(
            'email',
        );

    const passwordInput =
        document.getElementById(
            'password',
        );

    const passwordConfirmationInput =
        document.getElementById(
            'passwordConfirmation',
        );

    const termsInput =
        document.getElementById(
            'terms',
        );

    const submitButton =
        document.getElementById(
            'submitButton',
        );

    const submitButtonText =
        document.getElementById(
            'submitButtonText',
        );

    const submitSpinner =
        document.getElementById(
            'submitSpinner',
        );

    let slugEditedManually =
        false;

    let slugTimer =
        null;

    /*
    |--------------------------------------------------------------------------
    | Utilities
    |--------------------------------------------------------------------------
    */

    function normalizeSlug(
        value,
    ) {
        return String(
            value ?? '',
        )
            .trim()
            .toLowerCase()
            .replace(
                /[^a-z0-9\s-]/g,
                '',
            )
            .replace(
                /\s+/g,
                '-',
            )
            .replace(
                /-+/g,
                '-',
            )
            .replace(
                /^-|-$/g,
                '',
            );
    }

    function hideAlert() {
        alertBox.className =
            'alert hidden';

        alertBox.textContent =
            '';
    }

    function showAlert(
        message,
        type = 'error',
    ) {
        alertBox.textContent =
            message;

        alertBox.className =
            `alert ${type}`;

        alertBox.scrollIntoView({
            behavior:
                'smooth',

            block:
                'nearest',
        });
    }

    function clearErrors() {
        const errorElements =
            document.querySelectorAll(
                '.field-error',
            );

        errorElements.forEach(
            element => {
                element.textContent =
                    '';
            },
        );

        const invalidInputs =
            document.querySelectorAll(
                '.invalid',
            );

        invalidInputs.forEach(
            input => {
                input.classList.remove(
                    'invalid',
                );
            },
        );
    }

    function setFieldError(
        field,
        message,
    ) {
        const input =
            document.getElementById(
                field,
            );

        const error =
            document.getElementById(
                `${field}Error`,
            );

        if (
            input
        ) {
            input.classList.add(
                'invalid',
            );
        }

        if (
            error
        ) {
            error.textContent =
                message;
        }
    }

    function displayApiErrors(
        response,
    ) {
        const fieldErrors =
            response
                ?.errors
                ?.fieldErrors;

        if (
            fieldErrors &&
            typeof fieldErrors ===
                'object'
        ) {
            Object.entries(
                fieldErrors,
            ).forEach(
                ([
                    field,
                    messages,
                ]) => {
                    if (
                        Array.isArray(
                            messages,
                        ) &&
                        messages.length >
                            0
                    ) {
                        setFieldError(
                            field,
                            messages[0],
                        );
                    }
                },
            );
        }
    }

    function setSubmitting(
        submitting,
    ) {
        submitButton.disabled =
            submitting;

        submitSpinner.classList.toggle(
            'hidden',
            !submitting,
        );

        submitButtonText.textContent =
            submitting
                ? 'Creating workspace...'
                : 'Create organization';
    }

    /*
    |--------------------------------------------------------------------------
    | Password Toggles
    |--------------------------------------------------------------------------
    */

    const passwordToggleButtons =
        document.querySelectorAll(
            '.password-toggle',
        );

    passwordToggleButtons.forEach(
        button => {
            button.addEventListener(
                'click',
                () => {
                    const targetId =
                        button.dataset.target;

                    const target =
                        document.getElementById(
                            targetId,
                        );

                    if (
                        !target
                    ) {
                        return;
                    }

                    const hidden =
                        target.type ===
                        'password';

                    target.type =
                        hidden
                            ? 'text'
                            : 'password';

                    button.textContent =
                        hidden
                            ? 'Hide'
                            : 'Show';

                    button.setAttribute(
                        'aria-label',
                        hidden
                            ? 'Hide password'
                            : 'Show password',
                    );
                },
            );
        },
    );

    /*
    |--------------------------------------------------------------------------
    | Automatic Workspace Slug
    |--------------------------------------------------------------------------
    */

    organizationNameInput.addEventListener(
        'input',
        () => {
            if (
                slugEditedManually
            ) {
                return;
            }

            const generated =
                normalizeSlug(
                    organizationNameInput.value,
                );

            organizationSlugInput.value =
                generated;

            if (
                slugTimer
            ) {
                clearTimeout(
                    slugTimer,
                );
            }

            if (
                !generated
            ) {
                return;
            }

            slugTimer =
                setTimeout(
                    async () => {
                        try {
                            const url =
                                '/api/auth/register-organization/slug' +
                                '?name=' +
                                encodeURIComponent(
                                    organizationNameInput.value,
                                );

                            const response =
                                await fetch(
                                    url,
                                    {
                                        method:
                                            'GET',

                                        headers: {
                                            Accept:
                                                'application/json',
                                        },
                                    },
                                );

                            const result =
                                await response.json();

                            if (
                                response.ok &&
                                result
                                    ?.data
                                    ?.slug &&
                                !slugEditedManually
                            ) {
                                organizationSlugInput.value =
                                    result.data.slug;
                            }
                        } catch (
                            error
                        ) {
                            console.warn(
                                'Slug availability request failed:',
                                error,
                            );
                        }
                    },
                    450,
                );
        },
    );

    organizationSlugInput.addEventListener(
        'input',
        () => {
            slugEditedManually =
                true;

            organizationSlugInput.value =
                normalizeSlug(
                    organizationSlugInput.value,
                );
        },
    );

    /*
    |--------------------------------------------------------------------------
    | Client Validation
    |--------------------------------------------------------------------------
    */

    function validateForm() {
        clearErrors();

        let valid =
            true;

        const organizationName =
            organizationNameInput
                .value
                .trim();

        const organizationSlug =
            normalizeSlug(
                organizationSlugInput
                    .value,
            );

        const name =
            nameInput
                .value
                .trim();

        const email =
            emailInput
                .value
                .trim();

        const password =
            passwordInput.value;

        const passwordConfirmation =
            passwordConfirmationInput
                .value;

        if (
            organizationName.length <
            2
        ) {
            setFieldError(
                'organizationName',
                'Organization name must contain at least 2 characters.',
            );

            valid =
                false;
        }

        if (
            organizationSlug.length <
            2
        ) {
            setFieldError(
                'organizationSlug',
                'Please enter a valid workspace URL.',
            );

            valid =
                false;
        }

        if (
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/
                .test(
                    organizationSlug,
                )
        ) {
            setFieldError(
                'organizationSlug',
                'Use lowercase letters, numbers, and hyphens only.',
            );

            valid =
                false;
        }

        if (
            name.length <
            2
        ) {
            setFieldError(
                'name',
                'Please enter your full name.',
            );

            valid =
                false;
        }

        if (
            !email ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
                .test(
                    email,
                )
        ) {
            setFieldError(
                'email',
                'Please enter a valid email address.',
            );

            valid =
                false;
        }

        if (
            password.length <
            8
        ) {
            setFieldError(
                'password',
                'Password must contain at least 8 characters.',
            );

            valid =
                false;
        }

        if (
            password !==
            passwordConfirmation
        ) {
            setFieldError(
                'passwordConfirmation',
                'Password confirmation does not match.',
            );

            valid =
                false;
        }

        if (
            !termsInput.checked
        ) {
            showAlert(
                'Please confirm that you agree to create this organization.',
            );

            valid =
                false;
        }

        return valid;
    }

    /*
    |--------------------------------------------------------------------------
    | Register Organization
    |--------------------------------------------------------------------------
    */

    form.addEventListener(
        'submit',
        async event => {
            event.preventDefault();

            hideAlert();

            if (
                !validateForm()
            ) {
                return;
            }

            setSubmitting(
                true,
            );

            const payload = {
                organizationName:
                    organizationNameInput
                        .value
                        .trim(),

                organizationSlug:
                    normalizeSlug(
                        organizationSlugInput
                            .value,
                    ),

                name:
                    nameInput
                        .value
                        .trim(),

                email:
                    emailInput
                        .value
                        .trim()
                        .toLowerCase(),

                password:
                    passwordInput
                        .value,

                passwordConfirmation:
                    passwordConfirmationInput
                        .value,
            };

            try {
                const response =
                    await fetch(
                        '/api/auth/register-organization',
                        {
                            method:
                                'POST',

                            headers: {
                                Accept:
                                    'application/json',

                                'Content-Type':
                                    'application/json',
                            },

                            body:
                                JSON.stringify(
                                    payload,
                                ),
                        },
                    );

                const result =
                    await response.json();

                if (
                    !response.ok
                ) {
                    displayApiErrors(
                        result,
                    );

                    throw new Error(
                        result
                            ?.message ??
                        'Unable to create organization.',
                    );
                }

                /*
                |--------------------------------------------------------------------------
                | Store temporary organization ID
                |--------------------------------------------------------------------------
                |
                | Your CURRENT login API still expects organizationId.
                |
                | The user never needs to type it. We save it temporarily so
                | we can login automatically below.
                |
                */

                const organizationId =
                    result
                        ?.data
                        ?.organization
                        ?.id;

                if (
                    !organizationId
                ) {
                    throw new Error(
                        'Organization was created but its ID was not returned.',
                    );
                }

                /*
                |--------------------------------------------------------------------------
                | Automatic Login
                |--------------------------------------------------------------------------
                */

                const loginResponse =
                    await fetch(
                        '/api/auth/login',
                        {
                            method:
                                'POST',

                            headers: {
                                Accept:
                                    'application/json',

                                'Content-Type':
                                    'application/json',
                            },

                            body:
                                JSON.stringify({
                                    organizationId,

                                    email:
                                        payload.email,

                                    password:
                                        payload.password,
                                }),
                        },
                    );

                const loginResult =
                    await loginResponse.json();

                if (
                    !loginResponse.ok
                ) {
                    showAlert(
                        'Your organization was created successfully. Please sign in manually.',
                        'success',
                    );

                    window.setTimeout(
                        () => {
                            window.location.href =
                                '/admin';
                        },
                        1800,
                    );

                    return;
                }

                const accessToken =
                    loginResult
                        ?.data
                        ?.accessToken ??
                    loginResult
                        ?.accessToken;

                if (
                    accessToken
                ) {
                    localStorage.setItem(
                        'accessToken',
                        accessToken,
                    );

                    localStorage.setItem(
                        'token',
                        accessToken,
                    );
                }

                const refreshToken =
                    loginResult
                        ?.data
                        ?.refreshToken ??
                    loginResult
                        ?.refreshToken;

                if (
                    refreshToken
                ) {
                    localStorage.setItem(
                        'refreshToken',
                        refreshToken,
                    );
                }

                /*
                |--------------------------------------------------------------------------
                | The organizationId is internal
                |--------------------------------------------------------------------------
                |
                | It may be useful temporarily to your current frontend.
                | API authorization should still use the organizationId from
                | the JWT, not trust this value from API requests.
                |
                */

                localStorage.setItem(
                    'organizationId',
                    organizationId,
                );

                if (
                    result
                        ?.data
                        ?.organization
                        ?.slug
                ) {
                    localStorage.setItem(
                        'organizationSlug',
                        result.data
                            .organization
                            .slug,
                    );
                }

                showAlert(
                    'Organization created successfully. Opening your dashboard...',
                    'success',
                );

                window.setTimeout(
                    () => {
                        window.location.href =
                            '/admin';
                    },
                    900,
                );
            } catch (
                error
            ) {
                console.error(
                    'Organization registration error:',
                    error,
                );

                if (
                    !alertBox.classList
                        .contains(
                            'success',
                        )
                ) {
                    showAlert(
                        error
                            ?.message ??
                        'Something went wrong while creating your organization.',
                    );
                }
            } finally {
                setSubmitting(
                    false,
                );
            }
        },
    );
})();