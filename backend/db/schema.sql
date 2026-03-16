-- RouterHub Database Schema
CREATE DATABASE IF NOT EXISTS routerhub;
USE routerhub;

-- Admin table (supports login by username, email, or phone)
CREATE TABLE IF NOT EXISTS admin (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    password VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_email (email),
    UNIQUE KEY uk_phone (phone)
);

-- Routers table
CREATE TABLE IF NOT EXISTS routers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    lan_ip VARCHAR(50) NOT NULL,
    initial_ip VARCHAR(50),
    api_port INT DEFAULT 8728,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    wg_ip VARCHAR(50),
    webfig_port INT,
    wg_public_key TEXT,
    wg_private_key TEXT,
    client_name VARCHAR(100),
    monthly_price DECIMAL(10,2),
    notes TEXT,
    status ENUM('online','offline','tunnel_failed') DEFAULT 'offline',
    last_seen DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_wg_ip (wg_ip)
);

-- Vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    router_id INT NOT NULL,
    username VARCHAR(100),
    password VARCHAR(100),
    profile VARCHAR(100),
    uptime_limit VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    exported TINYINT DEFAULT 0,
    exported_at DATETIME,
    used TINYINT DEFAULT 0,
    FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE CASCADE
);

-- Revenue table
CREATE TABLE IF NOT EXISTS revenue (
    id INT PRIMARY KEY AUTO_INCREMENT,
    router_id INT NOT NULL,
    amount DECIMAL(10,2),
    voucher_profile VARCHAR(100),
    quantity INT,
    date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE CASCADE
);

-- WireGuard peers table
CREATE TABLE IF NOT EXISTS wireguard_peers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    router_id INT NOT NULL,
    public_key TEXT,
    private_key TEXT,
    wg_ip VARCHAR(50),
    last_handshake DATETIME,
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    status ENUM('connected','disconnected') DEFAULT 'disconnected',
    FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE CASCADE
);

-- Router stats cache (refreshed every 5 min)
CREATE TABLE IF NOT EXISTS router_stats (
    router_id INT NOT NULL PRIMARY KEY,
    cpu_load INT DEFAULT 0,
    memory_used BIGINT DEFAULT 0,
    memory_total BIGINT DEFAULT 0,
    uptime VARCHAR(100),
    updated_at DATETIME,
    FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE CASCADE
);
