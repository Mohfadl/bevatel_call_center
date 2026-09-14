CREATE TABLE IF NOT EXISTS `user_conversation_reads` (
    `id` VARCHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `conversation_id` VARCHAR(36) NOT NULL,
    `last_read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),

    UNIQUE KEY `uq_user_conversation_read`
        (`organization_id`, `user_id`, `conversation_id`),

    KEY `idx_ucr_organization`
        (`organization_id`),

    KEY `idx_ucr_user`
        (`user_id`),

    KEY `idx_ucr_conversation`
        (`conversation_id`),

    CONSTRAINT `fk_ucr_organization`
        FOREIGN KEY (`organization_id`)
        REFERENCES `Organization` (`id`)
        ON DELETE CASCADE,

    CONSTRAINT `fk_ucr_user`
        FOREIGN KEY (`user_id`)
        REFERENCES `User` (`id`)
        ON DELETE CASCADE,

    CONSTRAINT `fk_ucr_conversation`
        FOREIGN KEY (`conversation_id`)
        REFERENCES `Conversation` (`id`)
        ON DELETE CASCADE
);